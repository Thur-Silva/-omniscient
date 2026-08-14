import { Asset } from '../../domain/asset/entity'
import type { QuoteProvider } from '../../domain/asset/quote-provider'
import type { AssetQuote } from '../../domain/asset/type'
import { Portfolio, PortfolioItem } from '../../domain/portfolio/entity'
import type { Position } from '../../domain/portfolio/position'
import type { PositionRepository } from '../../domain/portfolio/repository'
import { calculateSafetyMargin } from '../../domain/valuation/models/safety-margin'
import { GrahamModel, type GrahamInput } from '../../domain/valuation/models/graham'

export interface PositionView {
  position: Position
  asset: Asset
  quote: AssetQuote | null
  quoteError: string | null
  fairValue: number | null
  safetyMargin: number | null
}

export interface PortfolioView {
  portfolio: Portfolio
  rows: PositionView[]
  /** Tickers cujas cotações falharam; a carteira ainda é renderizável. */
  quoteErrors: { ticker: string; message: string }[]
  lastUpdatedAt: string | null
}

/**
 * Monta a visão da carteira: lê as posições salvas, busca cotação de cada
 * ticker e calcula valuation onde o usuário informou fundamentos.
 */
export class LoadPortfolio {
  private readonly positions: PositionRepository
  private readonly quotes: QuoteProvider
  private readonly graham: GrahamModel

  constructor(positions: PositionRepository, quotes: QuoteProvider) {
    this.positions = positions
    this.quotes = quotes
    this.graham = new GrahamModel()
  }

  async execute(userId: string, signal?: AbortSignal): Promise<PortfolioView> {
    const positions = await this.positions.list()
    const portfolio = new Portfolio({ id: `portfolio_${userId}`, userId, name: 'Carteira' })

    if (positions.length === 0) {
      return { portfolio, rows: [], quoteErrors: [], lastUpdatedAt: null }
    }

    const outcomes = await this.quotes.getQuotes(
      positions.map((position) => position.ticker),
      signal,
    )

    const quotesByTicker = new Map<string, AssetQuote>()
    const errorsByTicker = new Map<string, string>()
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        quotesByTicker.set(outcome.ticker, outcome.quote)
      } else {
        errorsByTicker.set(outcome.ticker, outcome.error.message)
      }
    }

    const rows: PositionView[] = positions.map((position) => {
      const ticker = position.ticker.toUpperCase()
      const quote = quotesByTicker.get(ticker) ?? null
      const asset = this.toAsset(position, quote)

      // Aportes no mesmo ticker são consolidados pela entidade Portfolio.
      portfolio.addItem(
        new PortfolioItem({
          asset,
          quantity: position.quantity,
          averagePrice: position.averagePrice,
          acquiredAt: position.acquiredAt,
        }),
      )

      const fairValue = this.fairValueFor(position, quote)
      return {
        position,
        asset,
        quote,
        quoteError: errorsByTicker.get(ticker) ?? null,
        fairValue,
        safetyMargin:
          fairValue != null && quote != null ? calculateSafetyMargin(fairValue, quote.price) : null,
      }
    })

    return {
      portfolio,
      rows,
      quoteErrors: [...errorsByTicker].map(([ticker, message]) => ({ ticker, message })),
      lastUpdatedAt: quotesByTicker.size > 0 ? new Date().toISOString() : null,
    }
  }

  private toAsset(position: Position, quote: AssetQuote | null): Asset {
    const ticker = position.ticker.toUpperCase()
    const asset = new Asset({
      // Mesmo ticker => mesmo ativo, para a consolidação de aportes funcionar.
      id: ticker,
      ticker,
      name: quote?.longName ?? position.name ?? ticker,
      type: position.type,
      currency: quote?.currency ?? position.currency,
      sector: undefined,
    })

    if (quote) {
      asset.updateQuote({ price: quote.price, currency: quote.currency, asOf: quote.asOf })
    }
    return asset
  }

  /** Só avalia quando o usuário informou LPA e crescimento — nada é presumido. */
  private fairValueFor(position: Position, quote: AssetQuote | null): number | null {
    const { earningsPerShare, growthPercent } = position
    if (quote == null || earningsPerShare == null || growthPercent == null) return null

    const input: GrahamInput = {
      marketPrice: quote.price,
      earningsPerShare,
      growthPercent,
    }

    try {
      return this.graham.evaluate(input).fairValue
    } catch {
      // Fundamentos fora da faixa aceita pelo modelo: exibe "—" em vez de quebrar.
      return null
    }
  }
}

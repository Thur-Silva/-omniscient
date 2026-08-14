import type { AssetUniverseProvider } from '../../domain/asset/universe'
import { usesPriceToBook, type WatchlistItem } from '../../domain/watchlist/item'
import type { WatchlistRepository } from '../../domain/watchlist/repository'
import { GrahamModel } from '../../domain/valuation/models/graham'
import { PriceToBookModel } from '../../domain/valuation/models/price-to-book'

export type Verdict = 'barato' | 'justo' | 'caro' | 'sem-dados'

/**
 * Faixa de indiferença. Abaixo de 20% de margem o resultado depende demais das
 * premissas do modelo para virar recomendação de compra ou venda, então o meio da
 * escala é declarado "justo" em vez de forçar um lado.
 */
export const CHEAP_THRESHOLD = 0.2
export const EXPENSIVE_THRESHOLD = -0.2

export interface ScreenedAsset {
  item: WatchlistItem
  price: number | null
  changePercent: number | null
  sector: string | null
  logoUrl: string | null
  method: 'graham' | 'p/vp' | null
  fairValue: number | null
  /** Fração: 0,25 = 25% de desconto sobre o valor justo. */
  safetyMargin: number | null
  priceToBook: number | null
  verdict: Verdict
  /** Preenchido quando o veredicto é `sem-dados`, dizendo o que falta. */
  missing: string | null
}

export interface ScreeningResult {
  cheap: ScreenedAsset[]
  fair: ScreenedAsset[]
  expensive: ScreenedAsset[]
  unrated: ScreenedAsset[]
  pricedAt: string | null
  /** Tickers observados que o catálogo da brapi não devolveu. */
  missingPrices: string[]
}

/**
 * Classifica os ativos observados em barato / justo / caro.
 *
 * Ação usa Graham (LPA e crescimento); FII usa P/VP. A brapi não fornece nenhum
 * dos dois neste plano, então o que falta é dito ao usuário em vez de estimado.
 *
 * Todos os preços vêm de uma requisição só: `pricesFor` usa o catálogo completo,
 * que não sofre o limite de 1 símbolo por chamada do endpoint de cotação.
 */
export class ScreenWatchlist {
  private readonly watchlist: WatchlistRepository
  private readonly universe: AssetUniverseProvider
  private readonly graham: GrahamModel
  private readonly priceToBook: PriceToBookModel

  constructor(watchlist: WatchlistRepository, universe: AssetUniverseProvider) {
    this.watchlist = watchlist
    this.universe = universe
    this.graham = new GrahamModel()
    this.priceToBook = new PriceToBookModel()
  }

  async execute(signal?: AbortSignal): Promise<ScreeningResult> {
    const items = await this.watchlist.list()
    if (items.length === 0) {
      return { cheap: [], fair: [], expensive: [], unrated: [], pricedAt: null, missingPrices: [] }
    }

    const prices = await this.universe.pricesFor(
      items.map((item) => item.ticker),
      signal,
    )

    const screened = items.map((item) => this.screen(item, prices.get(item.ticker.toUpperCase())))

    const byMarginDesc = (a: ScreenedAsset, b: ScreenedAsset) =>
      (b.safetyMargin ?? 0) - (a.safetyMargin ?? 0)

    return {
      cheap: screened.filter((a) => a.verdict === 'barato').sort(byMarginDesc),
      fair: screened.filter((a) => a.verdict === 'justo').sort(byMarginDesc),
      // Mais caro primeiro: a margem mais negativa é a que pede atenção.
      expensive: screened.filter((a) => a.verdict === 'caro').sort((a, b) => byMarginDesc(b, a)),
      unrated: screened.filter((a) => a.verdict === 'sem-dados'),
      pricedAt: prices.size > 0 ? new Date().toISOString() : null,
      missingPrices: items
        .map((item) => item.ticker.toUpperCase())
        .filter((ticker) => !prices.has(ticker)),
    }
  }

  private screen(
    item: WatchlistItem,
    listed: { price: number | null; changePercent: number | null; sector: string | null; logoUrl: string | null } | undefined,
  ): ScreenedAsset {
    const base: ScreenedAsset = {
      item,
      price: listed?.price ?? null,
      changePercent: listed?.changePercent ?? null,
      sector: listed?.sector ?? null,
      logoUrl: listed?.logoUrl ?? null,
      method: null,
      fairValue: null,
      safetyMargin: null,
      priceToBook: null,
      verdict: 'sem-dados',
      missing: null,
    }

    if (base.price == null || base.price <= 0) {
      return { ...base, missing: 'sem cotação na brapi' }
    }

    if (usesPriceToBook(item.type)) {
      if (item.bookValuePerShare == null || item.bookValuePerShare <= 0) {
        return { ...base, missing: 'informe o VP por cota' }
      }
      const input = { marketPrice: base.price, bookValuePerShare: item.bookValuePerShare }
      try {
        const result = this.priceToBook.evaluate(input)
        return {
          ...base,
          method: 'p/vp',
          fairValue: result.fairValue,
          safetyMargin: result.safetyMargin,
          priceToBook: this.priceToBook.ratio(input),
          verdict: classify(result.safetyMargin),
        }
      } catch {
        return { ...base, missing: 'VP inválido' }
      }
    }

    if (item.earningsPerShare == null || item.growthPercent == null) {
      return { ...base, missing: 'informe LPA e crescimento' }
    }

    try {
      const result = this.graham.evaluate({
        marketPrice: base.price,
        earningsPerShare: item.earningsPerShare,
        growthPercent: item.growthPercent,
      })
      return {
        ...base,
        method: 'graham',
        fairValue: result.fairValue,
        safetyMargin: result.safetyMargin,
        verdict: classify(result.safetyMargin),
      }
    } catch {
      // Graham recusa LPA negativo e crescimento fora de 0–50.
      return { ...base, missing: 'LPA ou crescimento fora da faixa do modelo' }
    }
  }
}

function classify(safetyMargin: number): Verdict {
  if (safetyMargin >= CHEAP_THRESHOLD) return 'barato'
  if (safetyMargin <= EXPENSIVE_THRESHOLD) return 'caro'
  return 'justo'
}

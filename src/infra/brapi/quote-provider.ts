import type { QuoteOutcome, QuoteProvider } from '../../domain/asset/quote-provider'
import { isCurrency, type AssetQuote, type Currency } from '../../domain/asset/type'
import { QuoteUnavailableError } from '../../domain/errors/asset-error'
import { HttpError, NetworkError, type HttpClient } from '../http/client'
import type { BrapiQuoteData, BrapiQuoteResponse } from './types'

/**
 * O plano em uso aceita 1 símbolo por requisição (mais de um devolve HTTP 400
 * QUOTES_PER_REQUEST_EXCEEDED), então um lote vira N requisições limitadas.
 */
const MAX_CONCURRENT_REQUESTS = 4

export class BrapiQuoteProvider implements QuoteProvider {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  /** Busca a cotação de um ticker. Lança `QuoteUnavailableError` em falha. */
  async getQuote(ticker: string, signal?: AbortSignal): Promise<AssetQuote> {
    const symbol = normalizeTicker(ticker)
    if (symbol === '') {
      throw new QuoteUnavailableError('Ticker não informado')
    }

    let response: BrapiQuoteResponse
    try {
      response = await this.http.get<BrapiQuoteResponse>('/v2/stocks/quote', {
        query: { symbols: symbol },
        signal,
      })
    } catch (cause) {
      throw new QuoteUnavailableError(describeFailure(symbol, cause), { cause })
    }

    const result = response.results?.[0]
    if (!result?.data) {
      throw new QuoteUnavailableError(`A brapi não retornou cotação para ${symbol}`)
    }

    return toAssetQuote(result.symbol ?? symbol, result.data)
  }

  /** Busca várias cotações; um ticker que falha não derruba os demais. */
  async getQuotes(tickers: readonly string[], signal?: AbortSignal): Promise<QuoteOutcome[]> {
    const unique = [...new Set(tickers.map(normalizeTicker).filter((t) => t !== ''))]
    const outcomes: QuoteOutcome[] = []

    for (let i = 0; i < unique.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = unique.slice(i, i + MAX_CONCURRENT_REQUESTS)
      const settled = await Promise.all(
        batch.map(async (ticker): Promise<QuoteOutcome> => {
          try {
            return { ticker, status: 'fulfilled', quote: await this.getQuote(ticker, signal) }
          } catch (error) {
            return { ticker, status: 'rejected', error: toError(error) }
          }
        }),
      )
      outcomes.push(...settled)
    }

    return outcomes
  }
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

function toAssetQuote(symbol: string, data: BrapiQuoteData): AssetQuote {
  if (!Number.isFinite(data.regularMarketPrice) || data.regularMarketPrice <= 0) {
    throw new QuoteUnavailableError(`Preço inválido retornado para ${symbol}: ${data.regularMarketPrice}`)
  }

  return {
    ticker: symbol,
    shortName: data.shortName ?? symbol,
    longName: data.longName ?? data.shortName ?? symbol,
    price: data.regularMarketPrice,
    currency: toCurrency(data.currency),
    asOf: data.regularMarketTime ?? new Date().toISOString(),
    previousClose: data.regularMarketPreviousClose ?? null,
    open: data.regularMarketOpen ?? null,
    dayHigh: data.regularMarketDayHigh ?? null,
    dayLow: data.regularMarketDayLow ?? null,
    change: data.regularMarketChange ?? null,
    changePercent: data.regularMarketChangePercent ?? null,
    fiftyTwoWeekLow: data.fiftyTwoWeekLow ?? null,
    fiftyTwoWeekHigh: data.fiftyTwoWeekHigh ?? null,
    volume: data.regularMarketVolume ?? null,
    marketCap: data.marketCap ?? null,
    logoUrl: data.logourl ?? null,
  }
}

function toCurrency(value: string | null | undefined): Currency {
  const normalized = (value ?? 'BRL').trim().toUpperCase()
  return isCurrency(normalized) ? normalized : 'BRL'
}

/** Converte falhas de transporte em mensagens acionáveis para a UI. */
function describeFailure(symbol: string, cause: unknown): string {
  if (cause instanceof HttpError) {
    switch (cause.code) {
      case 'MISSING_TOKEN':
      case 'INVALID_TOKEN':
        return 'Token da brapi ausente ou inválido — confira BRAPI_TOKEN no ambiente do servidor'
      case 'NOT_FOUND':
        return `Ticker ${symbol} não encontrado na brapi`
      case 'QUOTES_PER_REQUEST_EXCEEDED':
        return 'O plano da brapi permite menos ativos por requisição do que o solicitado'
      default:
        break
    }
    if (cause.isRateLimited) {
      return 'Limite de requisições da brapi atingido — tente novamente em instantes'
    }
    return `brapi respondeu ${cause.status} para ${symbol}: ${cause.message}`
  }

  if (cause instanceof NetworkError) {
    return `Não foi possível falar com a brapi ao buscar ${symbol}`
  }

  return `Falha inesperada ao buscar ${symbol}`
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

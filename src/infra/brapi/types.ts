/**
 * Tipos da resposta de GET /v2/stocks/quote?symbols=<TICKER>
 * Confirmados contra a API em 14/08/2026.
 */

/** Payload de cotação — o que interessa fica em `results[0].data`. */
export interface BrapiQuoteData {
  shortName: string
  longName: string
  currency: string
  regularMarketPrice: number
  regularMarketDayHigh: number | null
  regularMarketDayLow: number | null
  regularMarketDayRange: string | null
  regularMarketChange: number | null
  regularMarketChangePercent: number | null
  regularMarketTime: string
  marketCap: number | null
  regularMarketVolume: number | null
  regularMarketPreviousClose: number | null
  regularMarketOpen: number | null
  fiftyTwoWeekRange: string | null
  fiftyTwoWeekLow: number | null
  fiftyTwoWeekHigh: number | null
  logourl: string | null
}

export interface BrapiQuoteResult {
  requestedSymbol: string
  symbol: string
  /** `true` quando a brapi resolveu o símbolo pedido para outro ticker. */
  changed: boolean
  data: BrapiQuoteData
}

export interface BrapiQuoteResponse {
  results: BrapiQuoteResult[]
  requestedAt: string
  took: string
}

/** Corpo de erro da brapi: `{ error: true, message, code }`. */
export interface BrapiErrorBody {
  error: boolean
  message: string
  code: string
}

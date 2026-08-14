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

/**
 * Item de GET /quote/list. Confirmado contra a API em 14/08/2026: traz preço e
 * classificação, mas nenhum fundamento (sem LPA, sem VP, sem P/L).
 */
export interface BrapiListItem {
  stock: string
  name: string | null
  close: number | null
  change: number | null
  volume: number | null
  market_cap: number | null
  logo: string | null
  sector: string | null
  subsector: string | null
  /** `stock` (ação), `fund` (FII) ou `bdr`. */
  type: string | null
  subType: string | null
}

export interface BrapiListResponse {
  stocks: BrapiListItem[]
  indexes?: { stock: string; name: string }[]
  availableSectors?: (string | null)[]
  availableStockTypes?: string[]
  totalCount?: number
  totalPages?: number
  currentPage?: number
  hasNextPage?: boolean
}

/** Corpo de erro da brapi: `{ error: true, message, code }`. */
export interface BrapiErrorBody {
  error: boolean
  message: string
  code: string
}

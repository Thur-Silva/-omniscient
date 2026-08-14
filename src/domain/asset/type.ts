export type AssetType =
  | 'stock'
  | 'fii'
  | 'bdr'
  | 'etf'
  | 'crypto'
  | 'treasury'
  | 'reit'
  | 'other'

export type Currency = 'BRL' | 'USD'

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Ação',
  fii: 'FII',
  bdr: 'BDR',
  etf: 'ETF',
  crypto: 'Cripto',
  treasury: 'Tesouro',
  reit: 'REIT',
  other: 'Outro',
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  BRL: 'R$',
  USD: 'US$',
}

export function isCurrency(value: string): value is Currency {
  return value === 'BRL' || value === 'USD'
}

export function isAssetType(value: string): value is AssetType {
  return value in ASSET_TYPE_LABELS
}

/** Preço mínimo que a entidade Asset guarda para calcular posição. */
export interface AssetSnapshot {
  price: number
  currency: Currency
  asOf: string
}

/** Cotação completa vinda de um provedor de mercado. */
export interface AssetQuote extends AssetSnapshot {
  ticker: string
  shortName: string
  longName: string
  previousClose: number | null
  open: number | null
  dayHigh: number | null
  dayLow: number | null
  change: number | null
  changePercent: number | null
  fiftyTwoWeekLow: number | null
  fiftyTwoWeekHigh: number | null
  volume: number | null
  marketCap: number | null
  logoUrl: string | null
}

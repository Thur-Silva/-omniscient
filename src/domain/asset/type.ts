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

export interface AssetSnapshot {
  price: number
  currency: Currency
  asOf: string
}

import type { AssetType, Currency } from '../asset/type'

/** Posição que o usuário declarou possuir. Cotação e valor vêm do provedor. */
export interface Position {
  id: string
  ticker: string
  name?: string
  type: AssetType
  currency: Currency
  quantity: number
  averagePrice: number
  acquiredAt: string
  /** Fundamentos opcionais para o modelo de Graham. */
  earningsPerShare?: number
  growthPercent?: number
}

export type NewPosition = Omit<Position, 'id'>

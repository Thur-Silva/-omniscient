import type { AssetType } from '../asset/type'

/**
 * Ativo em observação, com os fundamentos que o usuário informou.
 *
 * A brapi não devolve fundamento neste plano — nem LPA, nem VP — então a régua
 * de barato/caro depende do que o usuário preenche. Sem fundamento o ativo ainda
 * é acompanhado, só fica sem classificação.
 */
export interface WatchlistItem {
  id: string
  ticker: string
  name?: string
  type: AssetType
  /** Ação: lucro por ação, entrada do modelo de Graham. */
  earningsPerShare?: number
  /** Ação: crescimento anual esperado, de 0 a 50. */
  growthPercent?: number
  /** FII: valor patrimonial por cota, entrada do P/VP. */
  bookValuePerShare?: number
  addedAt: string
}

export type NewWatchlistItem = Omit<WatchlistItem, 'id' | 'addedAt'>

/** FII usa P/VP; o resto usa Graham. */
export function usesPriceToBook(type: AssetType): boolean {
  return type === 'fii' || type === 'reit'
}

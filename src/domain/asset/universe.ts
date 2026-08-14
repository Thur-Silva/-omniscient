import type { AssetType } from './type'

/** Um ativo listado, como a corretora/provedor conhece — sem posição do usuário. */
export interface UniverseAsset {
  ticker: string
  name: string
  type: AssetType
  sector: string | null
  price: number | null
  changePercent: number | null
  marketCap: number | null
  logoUrl: string | null
}

export interface UniverseQuery {
  /** Casa com ticker ou nome. */
  search?: string
  type?: AssetType
  sector?: string
  limit?: number
}

/**
 * Porta para o catálogo de ativos negociados.
 *
 * Separada de `QuoteProvider` porque o custo é outro: aqui uma requisição
 * devolve o mercado inteiro, enquanto a cotação detalhada é por ativo.
 */
export interface AssetUniverseProvider {
  search(query: UniverseQuery, signal?: AbortSignal): Promise<UniverseAsset[]>
  /** Preço de fechamento de vários tickers numa só requisição. */
  pricesFor(tickers: readonly string[], signal?: AbortSignal): Promise<Map<string, UniverseAsset>>
  sectors(signal?: AbortSignal): Promise<string[]>
}

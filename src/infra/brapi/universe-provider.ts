import type { AssetUniverseProvider, UniverseAsset, UniverseQuery } from '../../domain/asset/universe'
import type { AssetType } from '../../domain/asset/type'
import { QuoteUnavailableError } from '../../domain/errors/asset-error'
import type { HttpClient } from '../http/client'
import type { BrapiListItem, BrapiListResponse } from './types'

/** `type` da brapi -> tipo do domínio. */
function toAssetType(type: string | null | undefined): AssetType {
  switch ((type ?? '').toLowerCase()) {
    case 'stock':
      return 'stock'
    case 'fund':
      return 'fii'
    case 'bdr':
      return 'bdr'
    default:
      return 'other'
  }
}

/** Tipo do domínio -> `type` da brapi, para filtrar no servidor. */
function toBrapiType(type: AssetType | undefined): string | undefined {
  switch (type) {
    case 'stock':
      return 'stock'
    case 'fii':
      return 'fund'
    case 'bdr':
      return 'bdr'
    default:
      return undefined
  }
}

function toUniverseAsset(item: BrapiListItem): UniverseAsset {
  return {
    ticker: item.stock,
    name: item.name ?? item.stock,
    type: toAssetType(item.type),
    sector: item.sector ?? null,
    price: typeof item.close === 'number' ? item.close : null,
    changePercent: typeof item.change === 'number' ? item.change : null,
    marketCap: typeof item.market_cap === 'number' ? item.market_cap : null,
    logoUrl: item.logo ?? null,
  }
}

/**
 * Catálogo de ativos sobre GET /quote/list.
 *
 * Este endpoint devolve o mercado inteiro numa requisição e ignora o limite de 1
 * símbolo por chamada que vale no /quote. É por isso que a triagem precifica uma
 * lista de dezenas de tickers com uma única ida à rede, em vez de uma por ativo.
 */
export class BrapiUniverseProvider implements AssetUniverseProvider {
  private readonly http: HttpClient
  /** O catálogo muda pouco dentro de uma sessão; evita repetir 2000 itens. */
  private cache: { at: number; assets: UniverseAsset[]; sectors: string[] } | null = null
  private readonly ttlMs: number

  constructor(http: HttpClient, ttlMs = 120_000) {
    this.http = http
    this.ttlMs = ttlMs
  }

  async search(query: UniverseQuery, signal?: AbortSignal): Promise<UniverseAsset[]> {
    const limit = query.limit ?? 20
    const term = query.search?.trim() ?? ''

    // Busca por termo vai ao servidor: ele casa ticker e nome melhor que um
    // filtro local sobre a página que estiver em cache.
    if (term !== '') {
      const response = await this.request(
        { search: term, type: toBrapiType(query.type), sector: query.sector, limit },
        signal,
      )
      return (response.stocks ?? []).map(toUniverseAsset).slice(0, limit)
    }

    const all = await this.loadAll(signal)
    return all
      .filter((asset) => (query.type == null ? true : asset.type === query.type))
      .filter((asset) => (query.sector == null ? true : asset.sector === query.sector))
      .slice(0, limit)
  }

  async pricesFor(
    tickers: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, UniverseAsset>> {
    const wanted = new Set(tickers.map((t) => t.trim().toUpperCase()).filter((t) => t !== ''))
    const found = new Map<string, UniverseAsset>()
    if (wanted.size === 0) return found

    for (const asset of await this.loadAll(signal)) {
      if (wanted.has(asset.ticker)) found.set(asset.ticker, asset)
    }
    return found
  }

  async sectors(signal?: AbortSignal): Promise<string[]> {
    await this.loadAll(signal)
    return this.cache?.sectors ?? []
  }

  private async loadAll(signal?: AbortSignal): Promise<UniverseAsset[]> {
    const fresh = this.cache != null && Date.now() - this.cache.at < this.ttlMs
    if (fresh && this.cache) return this.cache.assets

    const response = await this.request({}, signal)
    const assets = (response.stocks ?? []).map(toUniverseAsset)
    const sectors = (response.availableSectors ?? []).filter((s): s is string => typeof s === 'string')
    this.cache = { at: Date.now(), assets, sectors: [...sectors].sort() }
    return assets
  }

  private async request(
    query: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<BrapiListResponse> {
    try {
      return await this.http.get<BrapiListResponse>('/quote/list', { query, signal })
    } catch (cause) {
      throw new QuoteUnavailableError('Não foi possível carregar a lista de ativos da brapi', {
        cause,
      })
    }
  }
}

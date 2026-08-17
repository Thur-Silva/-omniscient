import { QuoteUnavailableError } from '../../domain/errors/asset-error'
import type {
  StockFundamentals,
  StockFundamentalsProvider,
} from '../../domain/stock/fundamentals'
import type { HttpClient } from '../http/client'
import { STOCK_PATH, STOCK_QUERY, toStockFundamentals } from './stock-mapping'
import type { StatusInvestStockItem, StatusInvestStockResponse } from './types'

/**
 * Fundamentos de ação a partir da busca avançada do StatusInvest.
 *
 * Uma requisição devolve as ~617 ações listadas. Lucro líquido, payout e número
 * de ações não vêm prontos: são derivados em `stock-mapping.ts`, que o servidor
 * também usa para montar o ranking.
 */
export class StatusInvestStockProvider implements StockFundamentalsProvider {
  private readonly http: HttpClient
  private cache: { at: number; stocks: StockFundamentals[] } | null = null
  private readonly ttlMs: number

  constructor(http: HttpClient, ttlMs = 300_000) {
    this.http = http
    this.ttlMs = ttlMs
  }

  async list(signal?: AbortSignal): Promise<StockFundamentals[]> {
    if (this.cache != null && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.stocks
    }

    let response: StatusInvestStockResponse
    try {
      response = await this.http.get<StatusInvestStockResponse>(STOCK_PATH, {
        query: STOCK_QUERY,
        signal,
      })
    } catch (cause) {
      throw new QuoteUnavailableError(
        'Não foi possível carregar os fundamentos das ações. A fonte é um endpoint não oficial e pode estar indisponível.',
        { cause },
      )
    }

    const items = Array.isArray(response?.list) ? response.list : []
    if (items.length === 0) {
      throw new QuoteUnavailableError('A fonte de fundamentos respondeu sem nenhuma ação.')
    }

    const stocks = items
      .filter((item): item is StatusInvestStockItem => typeof item?.ticker === 'string')
      .map(toStockFundamentals)

    this.cache = { at: Date.now(), stocks }
    return stocks
  }

  async find(ticker: string, signal?: AbortSignal): Promise<StockFundamentals | null> {
    const wanted = ticker.trim().toUpperCase()
    if (wanted === '') return null
    const stocks = await this.list(signal)
    return stocks.find((stock) => stock.ticker === wanted) ?? null
  }
}

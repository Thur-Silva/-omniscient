import { QuoteUnavailableError } from '../../domain/errors/asset-error'
import type {
  StockFundamentals,
  StockFundamentalsProvider,
} from '../../domain/stock/fundamentals'
import type { HttpClient } from '../http/client'
import type { StatusInvestStockItem, StatusInvestStockResponse } from './types'

/** CategoryType 1 é o de ação na busca avançada. */
const STOCK_CATEGORY = 1

/** Filtros vazios: queremos o universo inteiro e decidimos no domínio. */
const EMPTY_SEARCH = JSON.stringify({
  Sector: '',
  SubSector: '',
  Segment: '',
  my_range: '-20;100',
  forecast: {
    upsidedownside: { Item1: null, Item2: null },
    estimatesnumber: { Item1: null, Item2: null },
    revisedup: true,
    reviseddown: true,
    consensus: [],
  },
  dy: { Item1: null, Item2: null },
  p_l: { Item1: null, Item2: null },
  roe: { Item1: null, Item2: null },
})

function toNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Positivo ou nulo: zero em campo de fundamento significa ausência de dado. */
function toPositive(value: number | null | undefined): number | null {
  const parsed = toNumber(value)
  return parsed != null && parsed > 0 ? parsed : null
}

function toFundamentals(item: StatusInvestStockItem): StockFundamentals {
  const price = toPositive(item.price)
  const marketCap = toPositive(item.valormercado)
  const eps = toNumber(item.lpa)
  const dividendYield = toNumber(item.dy)

  /**
   * A fonte não devolve o número de ações, mas devolve preço e capitalização, e
   * capitalização é preço × ações. Conferido contra o documento do BBAS3: a
   * divisão dá 5.730.834.040, exatamente as ações que ele declara.
   */
  const sharesOutstanding = price != null && marketCap != null ? marketCap / price : null

  /** Lucro líquido reconstruído a partir do lucro por ação. */
  const netIncome =
    eps != null && eps > 0 && sharesOutstanding != null ? eps * sharesOutstanding : null

  /**
   * Payout também é derivado: o dividendo por ação é o yield aplicado ao preço, e
   * a fração distribuída é esse dividendo sobre o lucro por ação. Fica nulo
   * quando a fonte não traz o yield, o que acontece em boa parte das ações.
   */
  const payout =
    dividendYield != null && dividendYield > 0 && price != null && eps != null && eps > 0
      ? (dividendYield / 100) * price / eps
      : null

  const roe = toNumber(item.roe)

  return {
    ticker: item.ticker.trim().toUpperCase(),
    name: item.companyname?.trim() ?? item.ticker,
    sector: item.segmentname?.trim() || item.sectorname?.trim() || null,
    price,
    netIncome,
    earningsPerShare: eps,
    payout,
    // Chega em pontos percentuais; o domínio raciocina em fração.
    returnOnEquity: roe != null ? roe / 100 : null,
    sharesOutstanding,
    bookValuePerShare: toNumber(item.vpa),
    priceToEarnings: toNumber(item.p_l),
    averageDailyLiquidity: toNumber(item.liquidezmediadiaria),
  }
}

/**
 * Fundamentos de ação a partir da busca avançada do StatusInvest.
 *
 * Uma requisição devolve as ~617 ações listadas. Lucro líquido, payout e número
 * de ações não vêm prontos: são derivados de LPA, DY, preço e capitalização, com
 * a conta documentada em `toFundamentals`.
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
      response = await this.http.get<StatusInvestStockResponse>(
        '/category/advancedsearchresultpaginated',
        {
          query: {
            search: EMPTY_SEARCH,
            orderColumn: '',
            isAsc: '',
            page: 0,
            take: 1000,
            CategoryType: STOCK_CATEGORY,
          },
          signal,
        },
      )
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
      .map(toFundamentals)

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

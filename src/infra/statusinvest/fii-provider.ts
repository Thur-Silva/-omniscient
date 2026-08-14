import type { FiiFundamentals, FiiFundamentalsProvider } from '../../domain/fii/fundamentals'
import { QuoteUnavailableError } from '../../domain/errors/asset-error'
import type { HttpClient } from '../http/client'
import type { StatusInvestFiiItem, StatusInvestFiiResponse } from './types'

/** CategoryType 2 é o de fundo imobiliário na busca avançada. */
const FII_CATEGORY = 2

/** Filtros vazios: queremos o universo inteiro e filtramos no domínio. */
const EMPTY_SEARCH = JSON.stringify({
  Segment: '',
  Gestao: '',
  my_range: '0;20',
  dy: { Item1: null, Item2: null },
  p_vp: { Item1: null, Item2: null },
})

function toNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toFundamentals(item: StatusInvestFiiItem): FiiFundamentals {
  return {
    ticker: item.ticker.trim().toUpperCase(),
    name: item.companyname?.trim() ?? item.ticker,
    segment: item.segment?.trim() || item.subsectorname?.trim() || null,
    price: toNumber(item.price),
    dividendYield: toNumber(item.dy),
    priceToBook: toNumber(item.p_vp),
    bookValuePerShare: toNumber(item.valorpatrimonialcota),
    averageDailyLiquidity: toNumber(item.liquidezmediadiaria),
    netWorth: toNumber(item.patrimonio),
    shareholders: toNumber(item.numerocotistas),
    lastDividend: toNumber(item.lastdividend),
  }
}

/**
 * Fundamentos de FII a partir da busca avançada do StatusInvest.
 *
 * Uma requisição devolve o universo completo com DY, P/VP, VP por cota e
 * liquidez média diária — os quatro campos que o ranking precisa e que a brapi
 * não fornece no plano em uso.
 *
 * A chamada passa pelo proxy do servidor: além de evitar CORS, mantém o
 * User-Agent e o Referer fora do browser.
 */
export class StatusInvestFiiProvider implements FiiFundamentalsProvider {
  private readonly http: HttpClient
  private cache: { at: number; funds: FiiFundamentals[] } | null = null
  private readonly ttlMs: number

  constructor(http: HttpClient, ttlMs = 300_000) {
    this.http = http
    this.ttlMs = ttlMs
  }

  async list(signal?: AbortSignal): Promise<FiiFundamentals[]> {
    if (this.cache != null && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.funds
    }

    let response: StatusInvestFiiResponse
    try {
      response = await this.http.get<StatusInvestFiiResponse>(
        '/category/advancedsearchresultpaginated',
        {
          query: {
            search: EMPTY_SEARCH,
            orderColumn: '',
            isAsc: '',
            page: 0,
            take: 1000,
            CategoryType: FII_CATEGORY,
          },
          signal,
        },
      )
    } catch (cause) {
      throw new QuoteUnavailableError(
        'Não foi possível carregar os fundamentos dos FIIs. A fonte é um endpoint não oficial e pode estar indisponível.',
        { cause },
      )
    }

    const items = Array.isArray(response?.list) ? response.list : []
    if (items.length === 0) {
      throw new QuoteUnavailableError('A fonte de fundamentos respondeu sem nenhum FII.')
    }

    const funds = items
      .filter((item): item is StatusInvestFiiItem => typeof item?.ticker === 'string')
      .map(toFundamentals)

    this.cache = { at: Date.now(), funds }
    return funds
  }
}

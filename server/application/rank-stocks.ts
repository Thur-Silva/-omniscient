import {
  normalizeDiscountRate,
  normalizeRequiredYield,
  normalizeRiskFreeRate,
  rankStocks,
  type RankingMode,
  type RateMode,
  type StockRanking,
} from '../../src/domain/stock/ranking'
import { FALLBACK_RISK_FREE_RATE } from '../../src/domain/valuation/cost-of-capital'
import { parseSelic, SELIC_PATH, SELIC_QUERY } from '../../src/infra/bcb/selic'
import { BAZIN_REQUIRED_YIELD } from '../../src/domain/valuation/models/bazin'
import type { StockFundamentals } from '../../src/domain/stock/fundamentals'
import {
  STOCK_PATH,
  STOCK_QUERY,
  toStockFundamentals,
} from '../../src/infra/statusinvest/stock-mapping'
import type {
  StatusInvestStockItem,
  StatusInvestStockResponse,
} from '../../src/infra/statusinvest/types'
import type { ServeOrigin } from '../../src/domain/cache/snapshot'
import type { CachedUpstreamFetch } from './cached-upstream-fetch'
import { buildSourceKey, upstreamByName } from '../api/upstreams'

export interface ServedRanking {
  ranking: StockRanking
  origin: ServeOrigin
  capturedAt: Date
  staleReason?: string
}

/**
 * Chave do ranking no banco.
 *
 * Tudo que muda o resultado entra na chave: `k` (taxa de desconto), `m` (a régua —
 * por setor ou um método fixo) e `dy` (o yield exigido do Bazin). Chaves distintas
 * significam registros distintos, cada um com a sua janela de 10 minutos, e todos
 * alimentados pelo mesmo snapshot de fundamentos.
 *
 * `v` é a versão da metodologia: v1 somava colocação de margem com colocação de
 * P/L, v2 ordenava só pela margem com uma fórmula única para todo o mercado. Sem
 * trocar a chave, um snapshot de até 10 minutos antes continuaria sendo servido
 * com a régua antiga.
 */
const RANKING_VERSION = 4

export interface RankingRequest {
  discountRate: number
  mode: RankingMode
  requiredYield: number
  rateMode: RateMode
  /** Taxa livre de risco que alimentou o CAPM, como fração. */
  riskFreeRate: number
}

/**
 * A chave carrega o que muda o resultado, e a taxa é parte disso.
 *
 * No modo CAPM o `k` da tela não entra — não existe um k só —, e o que entra é a
 * taxa livre de risco: quando o Copom mexe na Selic, o custo de capital de toda a
 * bolsa muda, e o ranking guardado precisa ser outro registro. No modo fixo é o
 * contrário: `k` manda e a Selic é irrelevante.
 */
function rankingKey(request: RankingRequest): string {
  const dy = (request.requiredYield * 100).toFixed(1)
  const rate =
    request.rateMode === 'capm'
      ? `r=capm&rf=${(request.riskFreeRate * 100).toFixed(1)}`
      : `r=fixo&k=${(request.discountRate * 100).toFixed(1)}`
  return `ranking:acoes?${rate}&m=${request.mode}&dy=${dy}&v=${RANKING_VERSION}`
}

function toSearch(query: Record<string, string | number>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) params.set(key, String(value))
  return `?${params.toString()}`
}

/**
 * Ranking de ações calculado no servidor e guardado no banco.
 *
 * Roda aqui, e não no browser, porque só o servidor alcança o Postgres: é o que
 * permite guardar o resultado e servi-lo pronto na janela seguinte, sem tocar na
 * fonte. São duas camadas de cache encaixadas, cada uma com a sua janela:
 *
 * - `fundamentos:…` — a resposta crua do StatusInvest, sem k na chave, então uma
 *   só ida à rede alimenta o ranking de todos os k e também a página de teto.
 * - `ranking:acoes?k=…` — o ranking já calculado, por taxa de desconto.
 *
 * Com o ranking em cache, nem a fonte nem o cálculo são refeitos dentro da
 * janela, independente de quantos usuários pedirem.
 */
export class RankStocks {
  private readonly cache: CachedUpstreamFetch | null
  private readonly env: NodeJS.ProcessEnv

  constructor(cache: CachedUpstreamFetch | null, env: NodeJS.ProcessEnv = process.env) {
    this.cache = cache
    this.env = env
  }

  async execute(requested: {
    discountRate: number
    mode?: RankingMode
    requiredYield?: number
    rateMode?: RateMode
  }): Promise<ServedRanking> {
    const rateMode: RateMode = requested.rateMode ?? 'capm'
    // A Selic só é buscada quando manda no resultado. No modo fixo ela não entra
    // na conta, e ir ao Banco Central para descartar o número seria trabalho vão.
    const riskFreeRate =
      rateMode === 'capm' ? await this.loadRiskFreeRate() : FALLBACK_RISK_FREE_RATE

    const request: RankingRequest = {
      discountRate: normalizeDiscountRate(requested.discountRate),
      mode: requested.mode ?? 'setor',
      requiredYield: normalizeRequiredYield(requested.requiredYield ?? BAZIN_REQUIRED_YIELD),
      rateMode,
      riskFreeRate: normalizeRiskFreeRate(riskFreeRate),
    }
    const options = {
      discountRate: request.discountRate,
      mode: request.mode,
      requiredYield: request.requiredYield,
      rateMode: request.rateMode,
      riskFreeRate: request.riskFreeRate,
    }

    // Sem banco a aplicação não para: calcula na hora, sem guardar.
    if (this.cache == null) {
      const stocks = await this.fetchStocks()
      return {
        ranking: rankStocks(stocks, options),
        origin: 'upstream',
        capturedAt: new Date(),
      }
    }

    const served = await this.cache.fetch(rankingKey(request), async () => {
      const stocks = await this.loadStocksCached()
      return { status: 200, payload: rankStocks(stocks, options), ok: true }
    })

    return {
      ranking: served.payload as StockRanking,
      origin: served.origin,
      capturedAt: served.capturedAt,
      staleReason: served.staleReason,
    }
  }

  /**
   * Taxa livre de risco pelo cache, com a mesma chave que o browser gera ao chamar
   * `/api/bcb/...`. Fonte fora do ar não derruba o ranking: cai no número de
   * reserva, que é o mesmo que a calculadora usa nessa situação.
   */
  private async loadRiskFreeRate(): Promise<number> {
    if (this.cache == null) return FALLBACK_RISK_FREE_RATE
    try {
      const upstream = upstreamByName('bcb')
      const search = toSearch(SELIC_QUERY)
      const key = buildSourceKey(upstream, `${upstream.prefix}${SELIC_PATH}`, search)
      const served = await this.cache.fetch(key, async () => {
        const response = await fetch(`${upstream.origin}${SELIC_PATH}${search}`, {
          headers: upstream.headers(this.env),
          signal: AbortSignal.timeout(upstream.timeoutMs),
        })
        const text = await response.text()
        let payload: unknown = text
        try {
          payload = JSON.parse(text)
        } catch {
          // Corpo não-JSON só interessa como diagnóstico de erro.
        }
        return { status: response.status, payload, ok: response.ok }
      })
      return parseSelic(served.payload)?.rate ?? FALLBACK_RISK_FREE_RATE
    } catch {
      return FALLBACK_RISK_FREE_RATE
    }
  }

  /**
   * Fundamentos pelo cache, com a mesma chave que o browser gera ao chamar
   * `/api/fundamentos/...`. Com as chaves iguais, o ranking e a página de teto
   * compartilham o mesmo snapshot em vez de buscarem duas vezes.
   */
  private async loadStocksCached(): Promise<StockFundamentals[]> {
    const upstream = upstreamByName('fundamentos')
    const search = toSearch(STOCK_QUERY)
    const key = buildSourceKey(upstream, `${upstream.prefix}${STOCK_PATH}`, search)

    const served = await this.cache!.fetch(key, () => this.callSource())
    return this.parse(served.payload)
  }

  private async fetchStocks(): Promise<StockFundamentals[]> {
    const result = await this.callSource()
    if (!result.ok) {
      throw new Error(`a fonte de fundamentos respondeu ${result.status}`)
    }
    return this.parse(result.payload)
  }

  private async callSource() {
    const upstream = upstreamByName('fundamentos')
    const url = `${upstream.origin}${STOCK_PATH}${toSearch(STOCK_QUERY)}`
    const response = await fetch(url, {
      headers: upstream.headers(this.env),
      signal: AbortSignal.timeout(upstream.timeoutMs),
    })
    const text = await response.text()
    let payload: unknown = text
    try {
      payload = JSON.parse(text)
    } catch {
      // Corpo não-JSON só interessa como diagnóstico de erro.
    }
    return { status: response.status, payload, ok: response.ok }
  }

  private parse(payload: unknown): StockFundamentals[] {
    const response = payload as StatusInvestStockResponse | null
    const items = Array.isArray(response?.list) ? response.list : []
    return items
      .filter((item): item is StatusInvestStockItem => typeof item?.ticker === 'string')
      .map(toStockFundamentals)
  }
}

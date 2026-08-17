import {
  computeCeiling,
  missingInputs,
  type CeilingParams,
} from '../../domain/stock/ceiling'
import {
  averageDividend,
  type DividendAverage,
  type DividendHistoryProvider,
} from '../../domain/stock/dividend-history'
import type {
  StockFundamentals,
  StockFundamentalsProvider,
} from '../../domain/stock/fundamentals'
import { selectMethod, type MethodSelection } from '../../domain/stock/method-selection'
import type { CeilingBreakdown } from '../../domain/valuation/breakdown'
import type { CeilingMethodId, MethodInput } from '../../domain/valuation/methods'
import { BAZIN_REQUIRED_YIELD } from '../../domain/valuation/models/bazin'
import { calculateSafetyMargin } from '../../domain/valuation/models/safety-margin'
import { EXPLICIT_YEARS, PERPETUAL_GROWTH } from '../../domain/valuation/models/two-phase-dcf'

/**
 * Taxa de desconto inicial. É a premissa do documento do BBAS3 e não vem de API
 * nenhuma: retorno exigido é escolha do investidor.
 */
export const DEFAULT_DISCOUNT_RATE = 0.2

/**
 * Os campos que a tela deixa o usuário editar, para todos os métodos.
 *
 * Um formulário só, e não um por método: as premissas se repetem entre os
 * modelos (ROE e payout definem g em três deles), e trocar de régua não deve
 * apagar o que já foi corrigido à mão. Cada método lê o subconjunto que usa.
 */
export interface CeilingAssumptions {
  netIncome: number | null
  payout: number | null
  returnOnEquity: number | null
  discountRate: number | null
  sharesOutstanding: number | null
  /**
   * g pedido para cada ano da fase explícita. `null` deixa o modelo derivar de
   * ROE × (1 − payout). É a sobrescrita do usuário sobre o valor inflado.
   */
  growthRates: (number | null)[]
  /** g pedido para a perpetuidade. O modelo limita em 3%. */
  perpetualGrowth: number | null
  /** Dividendo por ação, base dos métodos de dividendo. */
  dividendPerShare: number | null
  /** Yield exigido do Bazin. */
  requiredYield: number | null
  earningsPerShare: number | null
  bookValuePerShare: number | null
}

export interface PrefilledCeiling {
  fundamentals: StockFundamentals
  /** Já preenchido com o que a fonte trouxe. */
  assumptions: CeilingAssumptions
  /** Método recomendado para este ativo, e a razão. */
  selection: MethodSelection
  /**
   * Média de proventos dos últimos exercícios encerrados, quando o histórico veio
   * — é a base que o método de Bazin pede, em vez do dividendo de 12 meses.
   */
  dividendAverage: DividendAverage | null
  /** Rótulos do que falta para o método recomendado rodar. */
  missing: string[]
}

export interface CeilingResult {
  method: CeilingMethodId
  breakdown: CeilingBreakdown
  /** Preço teto por ação. */
  ceiling: number
  /** Fração de desconto contra o preço de mercado, quando há preço. */
  safetyMargin: number | null
  marketPrice: number | null
  growthRate: number | null
  uncappedGrowthRate: number | null
  growthCapped: boolean
}

/** Rótulos das premissas, para a tela dizer o que falta em português corrido. */
const INPUT_LABELS: Record<MethodInput, string> = {
  netIncome: 'lucro líquido',
  payout: 'payout',
  returnOnEquity: 'ROE',
  discountRate: 'taxa de desconto',
  sharesOutstanding: 'número de ações',
  dividendPerShare: 'dividendo por ação',
  requiredYield: 'yield exigido',
  earningsPerShare: 'lucro por ação',
  bookValuePerShare: 'valor patrimonial por ação',
}

/**
 * Preço teto de uma ação, pelo método que a natureza do ativo pede.
 *
 * O trabalho aqui é preencher as premissas com o que a fonte sabe e dizer qual
 * régua se aplica, para o usuário só corrigir o que estiver defasado e poder
 * trocar de método com consciência do que muda. O cálculo em si é do domínio.
 */
export class EstimatePriceCeiling {
  private readonly stocks: StockFundamentalsProvider
  private readonly dividends: DividendHistoryProvider | null

  constructor(stocks: StockFundamentalsProvider, dividends: DividendHistoryProvider | null = null) {
    this.stocks = stocks
    this.dividends = dividends
  }

  /** Ações que casam com o termo, por ticker ou nome. */
  async search(term: string, limit = 12, signal?: AbortSignal): Promise<StockFundamentals[]> {
    const needle = term.trim().toUpperCase()
    if (needle.length < 2) return []

    const all = await this.stocks.list(signal)
    const matches = all.filter(
      (stock) =>
        stock.ticker.includes(needle) || stock.name.toUpperCase().includes(needle),
    )
    // Ticker exato primeiro, depois quem começa com o termo: digitar "BBAS"
    // deve trazer BBAS3 antes de uma empresa com "bbas" no meio do nome.
    return matches
      .sort((a, b) => rankMatch(a, needle) - rankMatch(b, needle))
      .slice(0, limit)
  }

  async prefill(ticker: string, signal?: AbortSignal): Promise<PrefilledCeiling | null> {
    const fundamentals = await this.stocks.find(ticker, signal)
    if (fundamentals == null) return null

    const selection = selectMethod(fundamentals)

    /**
     * O histórico de proventos custa uma requisição por ticker, então só é buscado
     * aqui, na tela de um ativo. Falha ou ausência não impede o cálculo: os
     * métodos de dividendo caem para a base de 12 meses, avisando na tela.
     */
    let dividendAverage: DividendAverage | null = null
    if (this.dividends != null) {
      try {
        const history = await this.dividends.find(fundamentals.ticker, signal)
        if (history != null) {
          dividendAverage = averageDividend(history, new Date().getFullYear())
        }
      } catch {
        dividendAverage = null
      }
    }

    const assumptions: CeilingAssumptions = {
      netIncome: fundamentals.netIncome,
      payout: fundamentals.payout,
      returnOnEquity: fundamentals.returnOnEquity,
      // Único campo sem origem em dado: começa no padrão documentado.
      discountRate: DEFAULT_DISCOUNT_RATE,
      sharesOutstanding: fundamentals.sharesOutstanding,
      growthRates: Array.from({ length: EXPLICIT_YEARS }, () =>
        fundamentals.payout != null && fundamentals.returnOnEquity != null
          ? fundamentals.returnOnEquity * (1 - Math.min(1, fundamentals.payout))
          : null,
      ),
      perpetualGrowth: PERPETUAL_GROWTH,
      /**
       * Base de dividendo: o de 12 meses, que é o D₀ do desconto de dividendos.
       * O Bazin pede a média de cinco exercícios, e a tela troca a base ao trocar
       * de método — misturar as duas num campo só faria o DDM projetar
       * crescimento a partir de uma média histórica, que já é passado.
       */
      dividendPerShare: fundamentals.dividendPerShare,
      requiredYield: BAZIN_REQUIRED_YIELD,
      earningsPerShare: fundamentals.earningsPerShare,
      bookValuePerShare: fundamentals.bookValuePerShare,
    }

    return {
      fundamentals,
      assumptions,
      selection,
      dividendAverage,
      missing: this.missingFor(selection.recommended, assumptions),
    }
  }

  /** Rótulos das premissas que faltam para um método, dadas as premissas atuais. */
  missingFor(method: CeilingMethodId, assumptions: CeilingAssumptions): string[] {
    const { stock, params } = toDomain(assumptions, null)
    return missingInputs(method, stock, params).map((input) => INPUT_LABELS[input])
  }

  /**
   * Calcula o teto pelo método pedido. Devolve `null` enquanto faltar premissa, em
   * vez de assumir valor no lugar do usuário.
   */
  compute(
    method: CeilingMethodId,
    assumptions: CeilingAssumptions,
    marketPrice: number | null,
  ): CeilingResult | null {
    const { stock, params } = toDomain(assumptions, marketPrice)
    if (missingInputs(method, stock, params).length > 0) return null

    const computed = computeCeiling(method, stock, params)

    return {
      method: computed.method,
      breakdown: computed.breakdown,
      ceiling: computed.ceiling,
      safetyMargin:
        marketPrice != null && marketPrice > 0
          ? calculateSafetyMargin(computed.ceiling, marketPrice)
          : null,
      marketPrice,
      growthRate: computed.growthRate,
      uncappedGrowthRate: computed.uncappedGrowthRate,
      growthCapped: computed.growthCapped,
    }
  }
}

/**
 * Premissas da tela no formato do domínio.
 *
 * O DPA vai por `params`, não por `fundamentals`: dessa forma ele conta como base
 * informada, e a trava de dividendo não recorrente — que existe para o dado cru da
 * fonte no ranking — não recusa um número que o próprio usuário digitou ou que
 * veio da média de cinco anos.
 */
function toDomain(
  assumptions: CeilingAssumptions,
  marketPrice: number | null,
): { stock: StockFundamentals; params: CeilingParams } {
  const stock: StockFundamentals = {
    ticker: '',
    name: '',
    sector: null,
    sectorName: null,
    subsectorName: null,
    segmentName: null,
    price: marketPrice,
    netIncome: assumptions.netIncome,
    earningsPerShare: assumptions.earningsPerShare,
    payout: assumptions.payout,
    returnOnEquity: assumptions.returnOnEquity,
    sharesOutstanding: assumptions.sharesOutstanding,
    bookValuePerShare: assumptions.bookValuePerShare,
    priceToEarnings: null,
    averageDailyLiquidity: null,
    dividendYield: null,
    dividendPerShare: assumptions.dividendPerShare,
    revenueCagr5: null,
  }

  const params: CeilingParams = {
    // `missingInputs` reclama de premissa ausente; NaN aqui viraria essa reclamação.
    discountRate: assumptions.discountRate ?? Number.NaN,
    requiredYield: assumptions.requiredYield ?? Number.NaN,
    dividendPerShare: assumptions.dividendPerShare,
    growthRates: assumptions.growthRates,
    perpetualGrowth: assumptions.perpetualGrowth,
  }

  return { stock, params }
}

function rankMatch(stock: StockFundamentals, needle: string): number {
  if (stock.ticker === needle) return 0
  if (stock.ticker.startsWith(needle)) return 1
  if (stock.name.toUpperCase().startsWith(needle)) return 2
  return 3
}

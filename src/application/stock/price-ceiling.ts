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
import {
  resolveStockCostOfCapital,
  type RatePremises,
  type StockCostOfCapital,
} from '../../domain/stock/cost-of-capital'
import type { RiskFreeRate, RiskFreeRateProvider } from '../../domain/market/risk-free'
import {
  CORPORATE_TAX_RATE,
  FALLBACK_RISK_FREE_RATE,
} from '../../domain/valuation/cost-of-capital'
import type { CeilingBreakdown } from '../../domain/valuation/breakdown'
import type { CeilingMethodId, MethodInput } from '../../domain/valuation/methods'
import { BAZIN_REQUIRED_YIELD } from '../../domain/valuation/models/bazin'
import { calculateSafetyMargin } from '../../domain/valuation/models/safety-margin'
import { EXPLICIT_YEARS, PERPETUAL_GROWTH } from '../../domain/valuation/models/two-phase-dcf'

/**
 * Taxa de desconto de partida no modo manual.
 *
 * No modo padrão a taxa não é escolhida: sai do CAPM, com a taxa livre de risco do
 * Banco Central e o beta do setor relavancado pela dívida da empresa. Este número
 * existe para quando o usuário desliga o CAPM e quer exigir o que exigir — é a
 * premissa do documento do BBAS3, e continua sendo escolha dele.
 */
export const DEFAULT_DISCOUNT_RATE = 0.2

/**
 * Ke e WACC de um ativo, dadas as premissas de risco.
 *
 * Exposto para a tela poder recalcular a taxa a cada tecla: mudar o beta ou o
 * prêmio adicional muda o custo de capital, e o teto tem de acompanhar sem uma nova
 * ida à fonte.
 */
export function deriveCostOfCapital(
  fundamentals: StockFundamentals,
  premises: RatePremises,
): StockCostOfCapital {
  return resolveStockCostOfCapital(fundamentals, premises)
}

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
  /** Resultado operacional dos 12 meses, em reais. Base do fluxo da firma. */
  ebit: number | null
  /** Alíquota sobre o resultado operacional, como fração. */
  taxRate: number | null
  returnOnInvestedCapital: number | null
  /** Crescimento da fase explícita do FCFF, como fração. */
  revenueGrowth: number | null
  /** Dívida líquida em reais. Negativo é caixa líquido. */
  netDebt: number | null
  /** WACC, como fração. A taxa do fluxo da firma. */
  wacc: number | null
  /** Taxa livre de risco que alimenta o CAPM, como fração. */
  riskFreeRate: number | null
  /** Beta aplicado no CAPM. Vazio deixa o beta do setor relavancado valer. */
  beta: number | null
  /** Prêmio adicional exigido sobre o CAPM: iliquidez, governança, controlador. */
  extraPremium: number | null
  /** Spread de crédito da empresa, como fração. Vazio usa o degrau da escada. */
  debtSpread: number | null
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
  /** Taxa livre de risco usada, com data e origem — ou a de reserva, avisando. */
  riskFree: RiskFreeRate
  /**
   * Montagem do custo de capital deste ativo: beta, CAPM e WACC. `null` num cálculo
   * salvo reaberto, que traz as taxas gravadas em vez de remontá-las com a Selic de
   * hoje.
   */
  costOfCapital: StockCostOfCapital | null
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
  ebit: 'EBIT',
  taxRate: 'alíquota de imposto',
  returnOnInvestedCapital: 'ROIC',
  revenueGrowth: 'crescimento da receita',
  netDebt: 'dívida líquida',
  wacc: 'WACC',
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
  private readonly riskFree: RiskFreeRateProvider | null

  constructor(
    stocks: StockFundamentalsProvider,
    dividends: DividendHistoryProvider | null = null,
    riskFree: RiskFreeRateProvider | null = null,
  ) {
    this.stocks = stocks
    this.dividends = dividends
    this.riskFree = riskFree
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

    /**
     * Taxa livre de risco do Banco Central. Falha não impede o cálculo: cai para o
     * número de reserva, que a tela mostra como reserva — taxa de juros defasada
     * muda o teto de todo o mercado, e isso não pode ser silencioso.
     */
    const riskFree = await this.currentRiskFree(signal)
    const costOfCapital = resolveStockCostOfCapital(fundamentals, { riskFreeRate: riskFree.rate })

    const assumptions: CeilingAssumptions = {
      netIncome: fundamentals.netIncome,
      payout: fundamentals.payout,
      returnOnEquity: fundamentals.returnOnEquity,
      /**
       * A taxa não é mais escolha de tela: é o Ke deste ativo, montado pelo CAPM
       * com a Selic do dia e o beta do setor relavancado pela dívida da empresa. O
       * campo continua editável — quem exige mais que o CAPM tem razões que o
       * modelo não vê —, mas o ponto de partida agora é o custo de oportunidade.
       */
      discountRate: costOfCapital.costOfEquity,
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
      ebit: fundamentals.ebit,
      taxRate: CORPORATE_TAX_RATE,
      returnOnInvestedCapital: fundamentals.returnOnInvestedCapital,
      // No fluxo da firma o crescimento não sai de payout e ROE, que são medidas de
      // acionista: a fonte da fase explícita é o CAGR de receita de 5 anos.
      revenueGrowth: fundamentals.revenueCagr5,
      netDebt: fundamentals.netDebt,
      wacc: costOfCapital.wacc?.wacc ?? null,
      riskFreeRate: riskFree.rate,
      beta: costOfCapital.beta.beta,
      extraPremium: 0,
      debtSpread: costOfCapital.debt?.spread ?? null,
    }

    return {
      fundamentals,
      assumptions,
      selection,
      dividendAverage,
      riskFree,
      costOfCapital,
      missing: this.missingFor(selection.recommended, assumptions),
    }
  }

  /** Última Selic publicada, ou o número de reserva quando a fonte não responde. */
  private async currentRiskFree(signal?: AbortSignal): Promise<RiskFreeRate> {
    if (this.riskFree != null) {
      try {
        const observed = await this.riskFree.current(signal)
        if (observed != null) return observed
      } catch {
        // Fonte fora do ar é caso previsto, não erro de tela.
      }
    }
    return {
      rate: FALLBACK_RISK_FREE_RATE,
      asOf: '2026-08-18',
      label: 'Selic de reserva, do código',
      fallback: true,
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
    revenueCagr5: assumptions.revenueGrowth,
    // O custo de capital já foi resolvido antes de chegar aqui: o que a tela edita
    // são as taxas, não os insumos delas, então capitalização e alavancagem não
    // precisam viajar de volta ao domínio.
    marketCap: null,
    ebit: assumptions.ebit,
    enterpriseValue: null,
    netDebt: assumptions.netDebt,
    netDebtToEquity: null,
    netDebtToEbit: null,
    returnOnInvestedCapital: assumptions.returnOnInvestedCapital,
  }

  const params: CeilingParams = {
    // `missingInputs` reclama de premissa ausente; NaN aqui viraria essa reclamação.
    discountRate: assumptions.discountRate ?? Number.NaN,
    requiredYield: assumptions.requiredYield ?? Number.NaN,
    dividendPerShare: assumptions.dividendPerShare,
    growthRates: assumptions.growthRates,
    perpetualGrowth: assumptions.perpetualGrowth,
    wacc: assumptions.wacc,
    taxRate: assumptions.taxRate,
    revenueGrowth: assumptions.revenueGrowth,
    netDebt: assumptions.netDebt,
  }

  return { stock, params }
}

function rankMatch(stock: StockFundamentals, needle: string): number {
  if (stock.ticker === needle) return 0
  if (stock.ticker.startsWith(needle)) return 1
  if (stock.name.toUpperCase().startsWith(needle)) return 2
  return 3
}

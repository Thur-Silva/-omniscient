import type { CeilingMethodId, MethodFamily } from '../valuation/methods'
import { usesWacc } from '../valuation/methods'
import {
  EQUITY_RISK_PREMIUM,
  FALLBACK_RISK_FREE_RATE,
} from '../valuation/cost-of-capital'
import { BAZIN_REQUIRED_YIELD } from '../valuation/models/bazin'
import { calculateSafetyMargin } from '../valuation/models/safety-margin'
import { PERPETUAL_GROWTH } from '../valuation/models/two-phase-dcf'
import { resolveCeiling, type CeilingParams } from './ceiling'
import { resolveStockCostOfCapital } from './cost-of-capital'
import type { StockFundamentals } from './fundamentals'
import { selectMethod } from './method-selection'

export const STOCK_CRITERIA = {
  /** Abaixo disso não aparece: não há como entrar nem sair da posição. */
  minDailyLiquidity: 1_000_000,
  /**
   * Folga mínima entre a taxa de desconto e o crescimento da fase explícita.
   *
   * Sem isto o ranking vira lixo: a fonte reporta ROE de 366,8% para EQPA3, o que
   * daria g de 361% e um teto de R$ 3.654 contra um preço de R$ 5,17 — primeiro
   * lugar por dado ruim. O crescimento é truncado em `k − folga`, e o corte fica
   * marcado em `growthCapped` para a tela poder avisar.
   */
  growthGapToDiscount: 0.01,
  /** Faixa aceita para a taxa de desconto escolhida pelo usuário. */
  minDiscountRate: 0.04,
  maxDiscountRate: 0.4,
  /** Passo de arredondamento de k, para o cache não virar chave infinita. */
  discountRateStep: 0.005,
  /** Faixa aceita para a taxa livre de risco lida do Banco Central. */
  minRiskFreeRate: 0.02,
  maxRiskFreeRate: 0.3,
} as const

export type StockRejectionReason = 'sem-preco' | 'liquidez-baixa' | 'sem-metodo'

/**
 * De onde sai a taxa de desconto de cada ativo.
 *
 *  · `capm` — a taxa é calculada por ativo: Ke pelo CAPM, com o beta do setor
 *    relavancado pela dívida da empresa, e WACC quando o método desconta fluxo da
 *    firma. É o padrão, porque risco não é o mesmo em toda a bolsa: uma taxa única
 *    aplicada ao mercado inteiro premia sistematicamente o ativo mais arriscado, e
 *    ativo arriscado é justamente quem sobe num ranking por desconto.
 *  · `fixo` — a taxa é a que o usuário escolheu, igual para todos. Continua
 *    disponível porque comparar o mercado sob a mesma exigência de retorno é uma
 *    pergunta legítima; ela só não pode ser a única disponível.
 */
export type RateMode = 'capm' | 'fixo'

/**
 * Régua do ranking: `setor` avalia cada ação pelo método da natureza dela, e um
 * id de método força a mesma régua para todas.
 */
export type RankingMode = 'setor' | CeilingMethodId

export interface RankingOptions {
  /** Taxa fixa, usada quando `rateMode` é `fixo`. */
  discountRate: number
  mode: RankingMode
  /** Yield exigido do Bazin, como fração. */
  requiredYield?: number
  /** De onde sai a taxa. Omitido, CAPM/WACC por ativo. */
  rateMode?: RateMode
  /** Taxa livre de risco nominal, como fração. Só usada no modo `capm`. */
  riskFreeRate?: number
  /** Prêmio adicional exigido pelo usuário sobre o CAPM. */
  extraPremium?: number
}

export interface RankedStock {
  fundamentals: StockFundamentals
  /** Método que produziu este teto. */
  method: CeilingMethodId
  /** Método pedido pela régua, antes de qualquer degradação por falta de dado. */
  requestedMethod: CeilingMethodId
  fellBack: boolean
  fallbackReason: string | null
  /** Família do ativo e a frase que justifica a escolha. */
  family: MethodFamily
  methodReason: string
  /** `true` quando o comportamento observado mudou a etiqueta do setor. */
  adjustedByBehavior: boolean
  /** Taxa que descontou este fluxo: Ke para fluxo do acionista, WACC para a firma. */
  discountRateUsed: number | null
  /** Ke deste ativo, mesmo quando o método usado não desconta fluxo. */
  costOfEquity: number
  /** WACC deste ativo. `null` em financeiro e onde falta estrutura de capital. */
  wacc: number | null
  /** Beta aplicado no CAPM, já relavancado. `null` no modo de taxa fixa. */
  beta: number | null
  /** Beta desalavancado do setor, antes da alavancagem da empresa. */
  betaUnlevered: number | null
  /** D/E usado para relavancar o beta. */
  debtToEquity: number | null
  /** Preço teto por ação. */
  ceiling: number
  /** Desconto do mercado contra o teto, como fração. Único critério de ordem. */
  safetyMargin: number
  /** g aplicado, quando o método usa crescimento. */
  growthRate: number | null
  uncappedGrowthRate: number | null
  growthCapped: boolean
  /** Referência de tela, não entra na ordenação. */
  priceToEarnings: number | null
  position: number
}

export interface StockRanking {
  ranked: RankedStock[]
  /** Taxa fixa usada, já normalizada. Só significa algo quando `rateMode` é `fixo`. */
  discountRate: number
  rateMode: RateMode
  /** Taxa livre de risco que alimentou o CAPM, como fração. */
  riskFreeRate: number
  /** Prêmio de equity de um ativo com β = 1, para a tela mostrar a montagem. */
  equityRiskPremium: number
  mode: RankingMode
  requiredYield: number
  universeSize: number
  rejectedByReason: Record<StockRejectionReason, number>
  /** Quantas ações tiveram o crescimento truncado. */
  cappedCount: number
  /** Quantas ações caíram em cada método, para a tela mostrar a composição. */
  methodCounts: Partial<Record<CeilingMethodId, number>>
}

/**
 * Arredonda e limita a taxa de desconto.
 *
 * O ranking é cacheado por valor de k, então k livre viraria chave infinita no
 * banco. Passo de meio ponto percentual dentro de 4% a 40% deixa 73 chaves
 * possíveis, o que é suficiente para escolher e finito para guardar.
 */
export function normalizeDiscountRate(rate: number): number {
  const { minDiscountRate, maxDiscountRate, discountRateStep } = STOCK_CRITERIA
  if (!Number.isFinite(rate)) return 0.2
  const clamped = Math.min(maxDiscountRate, Math.max(minDiscountRate, rate))
  return Number((Math.round(clamped / discountRateStep) * discountRateStep).toFixed(4))
}

/**
 * Arredonda a taxa livre de risco em décimos de ponto percentual.
 *
 * A Selic efetiva do Banco Central varia na terceira casa entre dois dias, e sem
 * arredondar cada leitura viraria uma chave nova de cache com o mesmo ranking
 * dentro.
 */
export function normalizeRiskFreeRate(rate: number): number {
  const { minRiskFreeRate, maxRiskFreeRate } = STOCK_CRITERIA
  if (!Number.isFinite(rate) || rate <= 0) return FALLBACK_RISK_FREE_RATE
  const clamped = Math.min(maxRiskFreeRate, Math.max(minRiskFreeRate, rate))
  return Number(clamped.toFixed(3))
}

/** Mesmo raciocínio para o yield do Bazin: passo de meio ponto, faixa fechada. */
export function normalizeRequiredYield(rate: number): number {
  if (!Number.isFinite(rate)) return BAZIN_REQUIRED_YIELD
  const clamped = Math.min(0.2, Math.max(0.02, rate))
  return Number((Math.round(clamped / 0.005) * 0.005).toFixed(4))
}

function reject(stock: StockFundamentals): StockRejectionReason | null {
  if (stock.price == null || stock.price <= 0) return 'sem-preco'
  if ((stock.averageDailyLiquidity ?? 0) < STOCK_CRITERIA.minDailyLiquidity) {
    return 'liquidez-baixa'
  }
  return null
}

/**
 * Ranqueia ações pela margem de desconto contra o preço teto.
 *
 * Eixo único, diferente do ranking de FIIs: a margem já sai do modelo de
 * valuation, que embute lucro, payout, ROE e k. Somar P/L a ela pesaria lucro
 * duas vezes e deslocaria a ordem para longe do desconto, que é o que se quer
 * medir. P/L segue no retorno apenas como leitura de tela.
 *
 * O método de cada ação depende da régua escolhida. Em `setor`, a família do
 * ativo decide (ver `method-selection.ts`) e a lista mistura métodos de propósito:
 * comparar SAPR11 e WEGE3 pela mesma fórmula é o erro que a régua por setor
 * corrige. Com um método fixo, a lista fica comparável fórmula a fórmula, ao
 * custo de aplicar a mesma régua a negócios de economia diferente.
 */
export function rankStocks(
  universe: readonly StockFundamentals[],
  options: RankingOptions,
): StockRanking {
  const discountRate = normalizeDiscountRate(options.discountRate)
  const requiredYield = normalizeRequiredYield(options.requiredYield ?? BAZIN_REQUIRED_YIELD)
  const rateMode: RateMode = options.rateMode ?? 'capm'
  const riskFreeRate = normalizeRiskFreeRate(options.riskFreeRate ?? FALLBACK_RISK_FREE_RATE)

  const rejectedByReason: Record<StockRejectionReason, number> = {
    'sem-preco': 0,
    'liquidez-baixa': 0,
    'sem-metodo': 0,
  }
  const methodCounts: Partial<Record<CeilingMethodId, number>> = {}

  /**
   * Limite de g, dado o retorno exigido.
   *
   * A perpetuidade divide por (taxa − 3%): o limite precisa ficar acima disso para
   * o modelo de Gordon não devolver teto sem sentido. Com taxa por ativo o limite
   * também é por ativo, e é a menor das duas taxas que manda — a mesma cadeia de
   * métodos pode cair num fluxo de acionista ou num fluxo de firma.
   */
  const growthLimit = (rate: number) =>
    Math.max(
      PERPETUAL_GROWTH + STOCK_CRITERIA.growthGapToDiscount,
      rate - STOCK_CRITERIA.growthGapToDiscount,
    )

  const baseParams: CeilingParams = {
    discountRate,
    requiredYield,
    maxGrowth: growthLimit(discountRate),
    // No modo de taxa fixa a escolha do usuário vale para os dois fluxos. Não é o
    // ideal teórico — WACC e Ke não são a mesma taxa —, mas é o que "taxa fixa"
    // quer dizer, e a tela avisa que o número não veio do CAPM.
    wacc: rateMode === 'fixo' ? discountRate : null,
  }

  const evaluated: Omit<RankedStock, 'position'>[] = []

  for (const stock of universe) {
    const reason = reject(stock)
    if (reason != null) {
      rejectedByReason[reason] += 1
      continue
    }

    const selection = selectMethod(stock)
    const chain = options.mode === 'setor' ? selection.preference : [options.mode]

    /**
     * A taxa deste ativo. No modo CAPM ela sai do beta do setor relavancado pela
     * dívida da empresa; o WACC vem por cima, com o custo da dívida ponderado — e
     * fica nulo onde não se aplica, o que exclui o método de fluxo da firma da
     * cadeia sem precisar de regra extra.
     */
    const rates = rateMode === 'capm' ? resolveStockCostOfCapital(stock, { riskFreeRate }) : null
    const costOfEquityRate = rates?.costOfEquity ?? discountRate
    const waccRate = rates != null ? (rates.wacc?.wacc ?? null) : discountRate
    const params: CeilingParams =
      rates == null
        ? baseParams
        : {
            ...baseParams,
            discountRate: costOfEquityRate,
            wacc: waccRate,
            maxGrowth: growthLimit(Math.min(costOfEquityRate, waccRate ?? costOfEquityRate)),
          }

    const resolved = resolveCeiling(chain, stock, params)
    if (resolved == null) {
      rejectedByReason['sem-metodo'] += 1
      continue
    }

    methodCounts[resolved.method] = (methodCounts[resolved.method] ?? 0) + 1

    evaluated.push({
      fundamentals: stock,
      method: resolved.method,
      requestedMethod: resolved.requestedMethod,
      fellBack: resolved.fellBack,
      fallbackReason: resolved.fallbackReason,
      family: selection.family,
      methodReason: selection.reason,
      adjustedByBehavior: selection.adjustedByBehavior,
      discountRateUsed: usesWacc(resolved.method) ? waccRate : costOfEquityRate,
      costOfEquity: costOfEquityRate,
      wacc: waccRate,
      beta: rates?.beta.beta ?? null,
      betaUnlevered: rates?.beta.unlevered ?? null,
      debtToEquity: rates?.beta.debtToEquity ?? null,
      ceiling: resolved.ceiling,
      safetyMargin: calculateSafetyMargin(resolved.ceiling, stock.price!),
      growthRate: resolved.growthRate,
      uncappedGrowthRate: resolved.uncappedGrowthRate,
      growthCapped: resolved.growthCapped,
      priceToEarnings: stock.priceToEarnings ?? null,
    })
  }

  // Maior desconto primeiro. Empate cai para o ticker, só para a ordem ser estável
  // entre duas apurações do mesmo minuto.
  const ranked = [...evaluated]
    .sort(
      (a, b) =>
        b.safetyMargin - a.safetyMargin ||
        a.fundamentals.ticker.localeCompare(b.fundamentals.ticker),
    )
    .map((entry, index) => ({ ...entry, position: index + 1 }))

  return {
    ranked,
    discountRate,
    rateMode,
    riskFreeRate,
    equityRiskPremium: EQUITY_RISK_PREMIUM,
    mode: options.mode,
    requiredYield,
    universeSize: universe.length,
    rejectedByReason,
    cappedCount: ranked.filter((entry) => entry.growthCapped).length,
    methodCounts,
  }
}

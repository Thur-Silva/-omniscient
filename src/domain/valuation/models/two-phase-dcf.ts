import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'

/**
 * Crescimento na perpetuidade. Fixo de propósito: é premissa de longo prazo, não
 * leitura de mercado, e no exemplo do BBAS3 responde por 65,8% do valuation.
 */
export const PERPETUAL_GROWTH = 0.03

/** Anos de projeção explícita antes de entrar na perpetuidade. */
export const EXPLICIT_YEARS = 3

/**
 * Crescimento sustentável por retenção de lucro.
 *
 * O que a empresa não distribui é reinvestido ao seu próprio retorno, então o
 * lucro cresce a `ROE × (1 − payout)`. É daqui que payout e ROE entram no
 * valuation: nenhum dos dois desconta fluxo, os dois definem a inclinação.
 */
export function sustainableGrowth(returnOnEquity: number, payout: number): number {
  return returnOnEquity * (1 - payout)
}

export interface TwoPhaseDcfProjection {
  /** Lucro líquido do ano 0, em reais. */
  netIncome: number
  /** Fração distribuída do lucro: 0,25 é 25%. */
  payout: number
  /** Retorno sobre patrimônio como fração: 0,205 é 20,5%. */
  returnOnEquity: number
  /** Retorno mínimo exigido pelo investidor como fração: 0,20 é 20%. */
  discountRate: number
  /** Ações em circulação. */
  sharesOutstanding: number
  /**
   * g pedido para cada ano da fase explícita. `null`/omissão deixa o modelo
   * derivar de `ROE × (1 − payout)` — é o caminho padrão; a sobrescrita existe
   * para o usuário corrigir um ano que ache inflado sem mexer no resto.
   */
  growthRates?: (number | null | undefined)[]
  /**
   * g pedido para a perpetuidade, como fração. O modelo limita em
   * `PERPETUAL_GROWTH` (3%): além disso o valor de Gordon explodiria com
   * premissa insustentável. `null`/omissão usa o próprio limite.
   */
  perpetualGrowth?: number | null
}

export interface TwoPhaseDcfInput extends TwoPhaseDcfProjection {
  marketPrice: number
}

export interface ProjectedYear {
  year: number
  netIncome: number
  presentValue: number
  /** g aplicado naquele ano: o derivado ou a sobrescrita do usuário. */
  growthRate: number
  /** k aplicado naquele ano, como fração. */
  discountRate: number
}

export interface TwoPhaseDcfBreakdown {
  /** g da fase explícita derivado de ROE e payout, sem sobrescritas. */
  growthRate: number
  years: ProjectedYear[]
  explicitPresentValue: number
  /** Lucro do primeiro ano da perpetuidade. */
  terminalNetIncome: number
  /** Valor da perpetuidade medido na data do último ano explícito. */
  terminalValue: number
  terminalPresentValue: number
  totalPresentValue: number
  /** O preço teto: valor presente total dividido pelas ações. */
  fairValue: number
  /** Participação de cada fase no valuation, como fração. */
  explicitShare: number
  terminalShare: number
  /** Taxa de desconto aplicada, como fração. */
  discountRate: number
  /** g efetivamente aplicado na perpetuidade — sempre ≤ 3%. */
  perpetualGrowthRate: number
  /** g pedido pelo usuário, antes do limite de 3%. */
  requestedPerpetualGrowth: number
  /** `true` quando o usuário pediu mais que 3% e o modelo limitou. */
  perpetualGrowthCapped: boolean
}

/**
 * Fluxo de caixa descontado em duas fases sobre o lucro líquido.
 *
 * Projeta o lucro explicitamente por três anos crescendo a `ROE × (1 − payout)`
 * — cada ano pode ser sobrescrito pelo usuário —, traz cada ano a valor presente,
 * e resolve o resto do tempo pelo modelo de Gordon com crescimento perpétuo
 * limitado a 3%. O total dividido pelas ações é o preço teto.
 *
 * O fluxo descontado é o lucro **integral**, não o dividendo: o modelo pergunta
 * quanto vale toda a geração de lucro da empresa, e o payout entra apenas na
 * inclinação do crescimento. Descontar só o dividendo daria outro número, uma
 * ordem de grandeza menor.
 *
 * Documentado em `src/docs/BBAS3.MD`, cujo exemplo o modelo reproduz.
 */
export class TwoPhaseDcfModel implements ValuationModel<TwoPhaseDcfInput> {
  readonly name = 'dcf-2-fases'

  evaluate(input: TwoPhaseDcfInput): ValuationResult {
    if (input.marketPrice <= 0) {
      throw new ValuationError('marketPrice deve ser positivo')
    }

    const breakdown = this.project(input)

    return {
      model: this.name,
      fairValue: breakdown.fairValue,
      safetyMargin: calculateSafetyMargin(breakdown.fairValue, input.marketPrice),
      marketPrice: input.marketPrice,
      asOf: new Date().toISOString(),
    }
  }

  /** Cálculo completo, com a memória de cada etapa para a tela poder mostrar. */
  project(input: TwoPhaseDcfProjection): TwoPhaseDcfBreakdown {
    const { netIncome, payout, returnOnEquity, discountRate: k, sharesOutstanding } = input

    if (!Number.isFinite(netIncome) || netIncome <= 0) {
      throw new ValuationError(
        'O lucro líquido precisa ser positivo: o modelo desconta lucro, e prejuízo não tem preço teto por este caminho.',
      )
    }
    if (!Number.isFinite(payout) || payout < 0 || payout > 1) {
      throw new ValuationError('O payout precisa ficar entre 0% e 100%.')
    }
    if (!Number.isFinite(returnOnEquity) || returnOnEquity < 0) {
      throw new ValuationError('O ROE não pode ser negativo neste modelo.')
    }
    if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
      throw new ValuationError('O número de ações precisa ser positivo.')
    }
    // A perpetuidade divide por (k − g): sem esta guarda o valuation explode ou
    // troca de sinal, devolvendo um teto sem sentido em vez de um erro.
    if (!Number.isFinite(k) || k <= PERPETUAL_GROWTH) {
      throw new ValuationError(
        `A taxa de desconto precisa ser maior que o crescimento perpétuo de ${(PERPETUAL_GROWTH * 100).toFixed(0)}%.`,
      )
    }

    // Perpetuidade: o usuário pode pedir mais, mas o modelo limita em 3%. O
    // limite não é negociável: é a trava que impede premissa insustentável.
    const requestedPerpetualGrowth = input.perpetualGrowth ?? PERPETUAL_GROWTH
    if (!Number.isFinite(requestedPerpetualGrowth) || requestedPerpetualGrowth <= -1) {
      throw new ValuationError('O crescimento perpétuo precisa ser maior que −100%.')
    }
    const perpetualGrowthRate = Math.min(PERPETUAL_GROWTH, requestedPerpetualGrowth)
    const perpetualGrowthCapped = requestedPerpetualGrowth > PERPETUAL_GROWTH

    const growthRate = sustainableGrowth(returnOnEquity, payout)

    // Fase explícita: o crescimento vale já no ano 1. Cada ano aceita uma
    // sobrescrita do usuário; o resto deriva de ROE × (1 − payout).
    const years: ProjectedYear[] = []
    let previousNetIncome = netIncome
    for (let year = 1; year <= EXPLICIT_YEARS; year += 1) {
      const override = input.growthRates?.[year - 1]
      let yearGrowth = growthRate
      if (override != null) {
        if (!Number.isFinite(override) || override <= -1) {
          throw new ValuationError(
            `O crescimento do ano ${year} precisa ser maior que −100%.`,
          )
        }
        yearGrowth = override
      }
      const projected = previousNetIncome * (1 + yearGrowth)
      years.push({
        year,
        netIncome: projected,
        presentValue: projected / (1 + k) ** year,
        growthRate: yearGrowth,
        discountRate: k,
      })
      previousNetIncome = projected
    }
    const explicitPresentValue = years.reduce((sum, entry) => sum + entry.presentValue, 0)

    // Perpetuidade pelo modelo de Gordon, medida no último ano explícito.
    const lastNetIncome = years[years.length - 1].netIncome
    const terminalNetIncome = lastNetIncome * (1 + perpetualGrowthRate)
    const terminalValue = terminalNetIncome / (k - perpetualGrowthRate)
    const terminalPresentValue = terminalValue / (1 + k) ** EXPLICIT_YEARS

    const totalPresentValue = explicitPresentValue + terminalPresentValue

    return {
      growthRate,
      years,
      explicitPresentValue,
      terminalNetIncome,
      terminalValue,
      terminalPresentValue,
      totalPresentValue,
      fairValue: totalPresentValue / sharesOutstanding,
      explicitShare: explicitPresentValue / totalPresentValue,
      terminalShare: terminalPresentValue / totalPresentValue,
      discountRate: k,
      perpetualGrowthRate,
      requestedPerpetualGrowth,
      perpetualGrowthCapped,
    }
  }
}

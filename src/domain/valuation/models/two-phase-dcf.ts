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
 * valuation: os dois definem a inclinação e — via a trava de retenção — quanto
 * do lucro é de fato distribuível.
 */
export function sustainableGrowth(returnOnEquity: number, payout: number): number {
  return returnOnEquity * (1 - payout)
}

/**
 * Taxa de retenção de lucros exigida para sustentar o crescimento `g`.
 *
 * Crescer a `g` com retorno `ROE` exige manter no balanço a fração `g / ROE` do
 * lucro — a regra de capital regulatório (Basileia / Solvência SUSEP) aplicada
 * ao valuation. O que sobra (`1 − retenção`) é o que pode sair como
 * dividendo/JCP sem descapitalizar a operação. `g ≤ 0` não exige retenção
 * (distribui tudo); `g ≥ ROE` exige retenção total — crescer acima do retorno
 * pede capital externo, então não há fluxo a distribuir.
 */
export function retentionRate(growthRate: number, returnOnEquity: number): number {
  if (growthRate <= 0) return 0
  if (returnOnEquity <= 0) return 1
  return Math.min(1, growthRate / returnOnEquity)
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
  /** Lucro líquido projetado do ano. */
  netIncome: number
  /**
   * Fluxo efetivamente distribuível ao acionista (FCFE): `LL × (1 − g/ROE)`.
   * É o que o desconto usa — a retenção que sustenta o crescimento não pode
   * sair da empresa sem descumprir a exigência de capital.
   */
  fcfe: number
  /** FCFE descontado a k, trazido ao ano 0. */
  presentValue: number
  /** g aplicado naquele ano: o derivado ou a sobrescrita do usuário. */
  growthRate: number
  /** Fração do lucro retida para sustentar `g`: `min(1, g/ROE)`. */
  retentionRate: number
  /** Fração distribuível como dividendo/JCP: `1 − retenção`. */
  payoutRate: number
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
  /** Fluxo distribuível do primeiro ano da perpetuidade: `LL × (1 − g/ROE)`. */
  terminalFcfe: number
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
 * Fluxo de caixa descontado em duas fases sobre o fluxo distribuível (FCFE).
 *
 * Projeta o lucro explicitamente por três anos crescendo a `ROE × (1 − payout)`
 * — cada ano pode ser sobrescrito pelo usuário —, aplica em cada ano a trava de
 * retenção `b = min(1, g/ROE)` e desconta o que sobra (`LL × (1 − b)`) a valor
 * presente; o resto do tempo resolve-se pelo modelo de Gordon sobre o FCFE da
 * perpetuidade, com crescimento perpétuo limitado a 3%. O total dividido pelas
 * ações é o preço teto.
 *
 * Descontar o lucro integral enquanto o fluxo cresce exigiria ROE infinito: se
 * a empresa retém o capital que o crescimento pede — a regra de Basileia e de
 * Solvência da SUSEP —, o que o acionista pode de fato sacar é só o excedente.
 * A correção substitui o LL bruto pelo FCFE = LL × (1 − g/ROE).
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
        'O lucro líquido precisa ser positivo: o modelo desconta o fluxo distribuível, e prejuízo não tem preço teto por este caminho.',
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
    // sobrescrita do usuário; o resto deriva de ROE × (1 − payout). A trava de
    // retenção b = min(1, g/ROE) diz quanto do lucro fica no balanço para
    // sustentar g; o desconto usa o excedente (FCFE = LL × (1 − b)).
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
      const retention = retentionRate(yearGrowth, returnOnEquity)
      const fcfe = projected * (1 - retention)
      years.push({
        year,
        netIncome: projected,
        fcfe,
        presentValue: fcfe / (1 + k) ** year,
        growthRate: yearGrowth,
        retentionRate: retention,
        payoutRate: 1 - retention,
        discountRate: k,
      })
      previousNetIncome = projected
    }
    const explicitPresentValue = years.reduce((sum, entry) => sum + entry.presentValue, 0)

    // Perpetuidade pelo modelo de Gordon sobre o FCFE, medida no último ano
    // explícito: projeta o LL do ano N+1, aplica a mesma trava de retenção com o
    // g perpétuo (limitado a 3%) e divide o fluxo distribuível por (k − g).
    const lastNetIncome = years[years.length - 1].netIncome
    const terminalNetIncome = lastNetIncome * (1 + perpetualGrowthRate)
    const terminalRetention = retentionRate(perpetualGrowthRate, returnOnEquity)
    const terminalFcfe = terminalNetIncome * (1 - terminalRetention)
    const terminalValue = terminalFcfe / (k - perpetualGrowthRate)
    const terminalPresentValue = terminalValue / (1 + k) ** EXPLICIT_YEARS

    const totalPresentValue = explicitPresentValue + terminalPresentValue

    return {
      growthRate,
      years,
      explicitPresentValue,
      terminalNetIncome,
      terminalFcfe,
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

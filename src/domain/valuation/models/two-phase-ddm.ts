import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'
import { EXPLICIT_YEARS, PERPETUAL_GROWTH, sustainableGrowth } from './two-phase-dcf'

export interface TwoPhaseDdmProjection {
  /** Dividendo por ação dos últimos 12 meses (ano 0), em reais. */
  dividendPerShare: number
  /** Fração distribuída do lucro: 0,9 é 90%. Entra no g, não no fluxo. */
  payout: number
  /** Retorno sobre patrimônio como fração. */
  returnOnEquity: number
  discountRate: number
  /**
   * g da fase explícita, como fração. Omitido, deriva de `ROE × (1 − payout)`.
   * Serve para o ranking truncar crescimento absurdo sem mexer no ROE.
   */
  growthRate?: number | null
  /** g pedido para a perpetuidade. O modelo limita em `PERPETUAL_GROWTH`. */
  perpetualGrowth?: number | null
}

export interface TwoPhaseDdmInput extends TwoPhaseDdmProjection {
  marketPrice: number
}

export interface ProjectedDividend {
  year: number
  /** Dividendo por ação projetado do ano. */
  dividend: number
  presentValue: number
  growthRate: number
}

export interface TwoPhaseDdmBreakdown {
  /** g aplicado na fase explícita. */
  growthRate: number
  /** `true` quando o g veio de fora em vez de `ROE × (1 − payout)`. */
  growthOverridden: boolean
  years: ProjectedDividend[]
  explicitPresentValue: number
  /** Dividendo do primeiro ano da perpetuidade. */
  terminalDividend: number
  /** Valor da perpetuidade medido no último ano explícito. */
  terminalValue: number
  terminalPresentValue: number
  /** Preço teto por ação: o modelo já trabalha por ação. */
  fairValue: number
  explicitShare: number
  terminalShare: number
  discountRate: number
  perpetualGrowthRate: number
  requestedPerpetualGrowth: number
  perpetualGrowthCapped: boolean
}

/**
 * Dividendos descontados em duas fases.
 *
 * Projeta o dividendo por ação crescendo a `ROE × (1 − payout)` por três anos e
 * resolve o resto pelo modelo de Gordon com crescimento perpétuo limitado a 3%.
 * A soma dos valores presentes é o preço teto — não há divisão por ações porque o
 * fluxo já é por ação.
 *
 * A diferença econômica em relação ao FCD desta casa é qual fluxo se desconta: o
 * FCD desconta o que a empresa *poderia* distribuir depois de retiver o capital
 * que o crescimento exige (FCFE); aqui desconta-se o que ela *distribui*. Para
 * concessão madura de energia, saneamento ou telecom, e para seguradora com
 * payout alto, o dividendo é o fluxo que efetivamente chega ao acionista, e usá-lo
 * evita creditar à ação um caixa retido que nunca sai. É a razão de o método ser
 * o padrão de utilities: fluxo regulado, previsível e quase todo distribuído.
 *
 * Com `growthRate` igual ao g perpétuo o modelo colapsa no Gordon clássico
 * `D₁/(k − g)`.
 */
export class TwoPhaseDdmModel implements ValuationModel<TwoPhaseDdmInput> {
  readonly name = 'ddm-gordon'

  evaluate(input: TwoPhaseDdmInput): ValuationResult {
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

  project(input: TwoPhaseDdmProjection): TwoPhaseDdmBreakdown {
    const { dividendPerShare, payout, returnOnEquity, discountRate: k } = input

    if (!Number.isFinite(dividendPerShare) || dividendPerShare <= 0) {
      throw new ValuationError(
        'O dividendo por ação precisa ser positivo: este modelo desconta dividendo, e quem não paga não tem teto por este caminho.',
      )
    }
    if (!Number.isFinite(payout) || payout < 0 || payout > 1) {
      throw new ValuationError('O payout precisa ficar entre 0% e 100%.')
    }
    if (!Number.isFinite(returnOnEquity) || returnOnEquity < 0) {
      throw new ValuationError('O ROE não pode ser negativo neste modelo.')
    }
    if (!Number.isFinite(k) || k <= PERPETUAL_GROWTH) {
      throw new ValuationError(
        `A taxa de desconto precisa ser maior que o crescimento perpétuo de ${(PERPETUAL_GROWTH * 100).toFixed(0)}%.`,
      )
    }

    const requestedPerpetualGrowth = input.perpetualGrowth ?? PERPETUAL_GROWTH
    if (!Number.isFinite(requestedPerpetualGrowth) || requestedPerpetualGrowth <= -1) {
      throw new ValuationError('O crescimento perpétuo precisa ser maior que −100%.')
    }
    const perpetualGrowthRate = Math.min(PERPETUAL_GROWTH, requestedPerpetualGrowth)
    const perpetualGrowthCapped = requestedPerpetualGrowth > PERPETUAL_GROWTH

    const override = input.growthRate
    if (override != null && (!Number.isFinite(override) || override <= -1)) {
      throw new ValuationError('O crescimento da fase explícita precisa ser maior que −100%.')
    }
    const growthRate = override ?? sustainableGrowth(returnOnEquity, payout)

    const years: ProjectedDividend[] = []
    let previous = dividendPerShare
    for (let year = 1; year <= EXPLICIT_YEARS; year += 1) {
      const dividend = previous * (1 + growthRate)
      years.push({
        year,
        dividend,
        presentValue: dividend / (1 + k) ** year,
        growthRate,
      })
      previous = dividend
    }
    const explicitPresentValue = years.reduce((sum, entry) => sum + entry.presentValue, 0)

    const terminalDividend = previous * (1 + perpetualGrowthRate)
    const terminalValue = terminalDividend / (k - perpetualGrowthRate)
    const terminalPresentValue = terminalValue / (1 + k) ** EXPLICIT_YEARS

    const fairValue = explicitPresentValue + terminalPresentValue

    return {
      growthRate,
      growthOverridden: override != null,
      years,
      explicitPresentValue,
      terminalDividend,
      terminalValue,
      terminalPresentValue,
      fairValue,
      explicitShare: explicitPresentValue / fairValue,
      terminalShare: terminalPresentValue / fairValue,
      discountRate: k,
      perpetualGrowthRate,
      requestedPerpetualGrowth,
      perpetualGrowthCapped,
    }
  }
}

import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'

export interface GrahamInput {
  marketPrice: number
  earningsPerShare: number
  growthPercent: number
  aaBondYieldPercent?: number
}

export class GrahamModel implements ValuationModel<GrahamInput> {
  readonly name = 'graham'

  evaluate(input: GrahamInput): ValuationResult {
    if (input.earningsPerShare <= 0) {
      throw new ValuationError('earningsPerShare deve ser positivo')
    }
    if (input.growthPercent < 0 || input.growthPercent > 50) {
      throw new ValuationError('growthPercent deve estar entre 0 e 50')
    }

    const yieldAdjustment = (input.aaBondYieldPercent ?? 4.4) / 4.4
    const fairValue =
      input.earningsPerShare * (8.5 + 2 * input.growthPercent) * yieldAdjustment

    return {
      model: this.name,
      fairValue,
      safetyMargin: calculateSafetyMargin(fairValue, input.marketPrice),
      marketPrice: input.marketPrice,
      asOf: new Date().toISOString(),
    }
  }
}

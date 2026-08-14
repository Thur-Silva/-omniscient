import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'

export interface DcfInput {
  marketPrice: number
  freeCashFlow: number
  sharesOutstanding: number
  growthRate: number
  discountRate: number
  terminalGrowthRate: number
  projectionYears?: number
}

export class DcfModel implements ValuationModel<DcfInput> {
  readonly name = 'dcf'

  evaluate(input: DcfInput): ValuationResult {
    this.validate(input)

    const years = input.projectionYears ?? 5
    let projectedFcf = input.freeCashFlow
    let presentValue = 0

    for (let year = 1; year <= years; year++) {
      projectedFcf *= 1 + input.growthRate
      presentValue += projectedFcf / Math.pow(1 + input.discountRate, year)
    }

    const terminalValue =
      (projectedFcf * (1 + input.terminalGrowthRate)) /
      (input.discountRate - input.terminalGrowthRate)

    const presentTerminalValue = terminalValue / Math.pow(1 + input.discountRate, years)

    const enterpriseValue = presentValue + presentTerminalValue
    const fairValue = enterpriseValue / input.sharesOutstanding

    return {
      model: this.name,
      fairValue,
      safetyMargin: calculateSafetyMargin(fairValue, input.marketPrice),
      marketPrice: input.marketPrice,
      asOf: new Date().toISOString(),
    }
  }

  private validate(input: DcfInput): void {
    const errors: string[] = []
    if (input.freeCashFlow <= 0) errors.push('freeCashFlow deve ser positivo')
    if (input.sharesOutstanding <= 0) errors.push('sharesOutstanding deve ser positivo')
    if (input.growthRate < 0 || input.growthRate > 0.5) errors.push('growthRate deve estar entre 0 e 0.5')
    if (input.discountRate <= input.terminalGrowthRate) {
      errors.push('discountRate deve ser maior que terminalGrowthRate')
    }
    if (input.terminalGrowthRate < 0 || input.terminalGrowthRate > 0.1) {
      errors.push('terminalGrowthRate deve estar entre 0 e 0.1')
    }
    if (errors.length > 0) throw new ValuationError(errors.join('; '))
  }
}

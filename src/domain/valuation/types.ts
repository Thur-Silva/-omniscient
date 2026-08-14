export interface ValuationResult {
  model: string
  fairValue: number
  safetyMargin: number
  marketPrice: number
  asOf: string
}

export interface ValuationModel<Input> {
  readonly name: string
  evaluate(input: Input): ValuationResult
}

export function formatSafetyMargin(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

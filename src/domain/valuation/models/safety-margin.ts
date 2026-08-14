import { ValuationError } from '../../errors/valuation-error'

export function calculateSafetyMargin(fairValue: number, marketPrice: number): number {
  if (fairValue <= 0) {
    throw new ValuationError('fairValue deve ser positivo')
  }
  if (marketPrice <= 0) {
    throw new ValuationError('marketPrice deve ser positivo')
  }
  return (fairValue - marketPrice) / fairValue
}

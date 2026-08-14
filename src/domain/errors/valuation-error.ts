import { DomainError } from './domain-error'

export class ValuationError extends DomainError {
  readonly code = 'VALUATION_ERROR'
}

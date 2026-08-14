import { DomainError } from './domain-error'

export class InvalidQuoteError extends DomainError {
  readonly code = 'INVALID_QUOTE'
}

export class QuoteUnavailableError extends DomainError {
  readonly code = 'QUOTE_UNAVAILABLE'
}

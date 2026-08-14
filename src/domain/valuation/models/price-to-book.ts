import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'

export interface PriceToBookInput {
  marketPrice: number
  /** Valor patrimonial por cota (VP). */
  bookValuePerShare: number
}

/**
 * P/VP — a régua usual de FII.
 *
 * Graham parte de lucro por ação e não se aplica a fundo imobiliário. Para FII o
 * referencial é o patrimônio: o valor justo da cota é o próprio VP, e negociar
 * abaixo dele (P/VP < 1) é o que se chama de desconto.
 */
export class PriceToBookModel implements ValuationModel<PriceToBookInput> {
  readonly name = 'p/vp'

  evaluate(input: PriceToBookInput): ValuationResult {
    if (input.bookValuePerShare <= 0) {
      throw new ValuationError('bookValuePerShare deve ser positivo')
    }
    if (input.marketPrice <= 0) {
      throw new ValuationError('marketPrice deve ser positivo')
    }

    return {
      model: this.name,
      fairValue: input.bookValuePerShare,
      safetyMargin: calculateSafetyMargin(input.bookValuePerShare, input.marketPrice),
      marketPrice: input.marketPrice,
      asOf: new Date().toISOString(),
    }
  }

  /** P/VP em si, para exibir junto do resultado. */
  ratio(input: PriceToBookInput): number {
    if (input.bookValuePerShare <= 0) {
      throw new ValuationError('bookValuePerShare deve ser positivo')
    }
    return input.marketPrice / input.bookValuePerShare
  }
}

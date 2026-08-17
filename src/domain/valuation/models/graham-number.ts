import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'

/**
 * O produto dos limites defensivos de Graham: P/L ≤ 15 e P/VP ≤ 1,5.
 *
 * O 22,5 não é constante de teoria nenhuma, é 15 × 1,5. Fica explícito aqui para
 * ninguém tratar o número como derivação.
 */
export const GRAHAM_DEFENSIVE_PRODUCT = 22.5

export interface GrahamNumberProjection {
  /** Lucro por ação dos últimos 12 meses, em reais. */
  earningsPerShare: number
  /** Valor patrimonial por ação, em reais. */
  bookValuePerShare: number
}

export interface GrahamNumberInput extends GrahamNumberProjection {
  marketPrice: number
}

export interface GrahamNumberBreakdown {
  earningsPerShare: number
  bookValuePerShare: number
  /** Preço teto: √(22,5 × LPA × VPA). */
  fairValue: number
  /**
   * P/L no preço teto.
   *
   * O que a fórmula garante é o produto: `P/L × P/VP = 22,5` no teto. Cada lado
   * isolado passa do limite defensivo quando lucro e patrimônio divergem — BBAS3,
   * com VPA doze vezes o LPA, dá P/L de 16,5 contra P/VP de 1,36. A média
   * geométrica é do par, não de cada critério.
   */
  priceToEarningsAtCeiling: number
  /** P/VP no preço teto. Vale a mesma observação do P/L. */
  priceToBookAtCeiling: number
}

/**
 * Número de Graham — teto de triagem.
 *
 * `√(22,5 × LPA × VPA)`, a média geométrica entre o limite de lucro e o limite de
 * patrimônio do investidor defensivo. Vale como teto onde projetar fluxo é chute:
 * em cíclica de commodity, o lucro dos últimos 12 meses pode ser de pico ou de
 * fundo do ciclo, e a raiz do produto com o patrimônio amortece o erro em vez de
 * multiplicá-lo por três anos de projeção.
 *
 * Sem eufemismo: é uma heurística de screening, não um valuation. Não desconta
 * fluxo, não olha dívida, não olha crescimento e não olha qualidade do lucro. O
 * sistema o usa como padrão apenas onde o modelo de fluxo erraria pior, e o rótulo
 * na tela diz isso.
 */
export class GrahamNumberModel implements ValuationModel<GrahamNumberInput> {
  readonly name = 'numero-graham'

  evaluate(input: GrahamNumberInput): ValuationResult {
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

  project(input: GrahamNumberProjection): GrahamNumberBreakdown {
    const { earningsPerShare, bookValuePerShare } = input

    if (!Number.isFinite(earningsPerShare) || earningsPerShare <= 0) {
      throw new ValuationError(
        'O lucro por ação precisa ser positivo: prejuízo não tem teto por este caminho.',
      )
    }
    if (!Number.isFinite(bookValuePerShare) || bookValuePerShare <= 0) {
      throw new ValuationError('O valor patrimonial por ação precisa ser positivo.')
    }

    const fairValue = Math.sqrt(
      GRAHAM_DEFENSIVE_PRODUCT * earningsPerShare * bookValuePerShare,
    )

    return {
      earningsPerShare,
      bookValuePerShare,
      fairValue,
      priceToEarningsAtCeiling: fairValue / earningsPerShare,
      priceToBookAtCeiling: fairValue / bookValuePerShare,
    }
  }
}

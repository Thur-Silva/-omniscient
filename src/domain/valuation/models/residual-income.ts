import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'
import { PERPETUAL_GROWTH, sustainableGrowth } from './two-phase-dcf'

export interface ResidualIncomeProjection {
  /** Valor patrimonial por ação, em reais. */
  bookValuePerShare: number
  /** Retorno sobre patrimônio como fração. */
  returnOnEquity: number
  /** Retorno exigido pelo investidor, como fração. */
  discountRate: number
  /** Fração distribuída do lucro. Entra no g, por retenção. */
  payout: number
  /** g explícito, como fração. Omitido, deriva de `ROE × (1 − payout)`. */
  growthRate?: number | null
}

export interface ResidualIncomeInput extends ResidualIncomeProjection {
  marketPrice: number
}

export interface ResidualIncomeBreakdown {
  bookValuePerShare: number
  returnOnEquity: number
  discountRate: number
  /** g aplicado, já limitado ao crescimento perpétuo. */
  growthRate: number
  growthOverridden: boolean
  /** g antes do limite de perpetuidade, quando houve corte. */
  requestedGrowthRate: number
  growthCapped: boolean
  /** ROE − k: o retorno acima do custo de capital, o que justifica prêmio. */
  excessReturn: number
  /** O múltiplo de patrimônio justificado: (ROE − g)/(k − g). */
  justifiedPriceToBook: number
  /** Preço teto por ação. */
  fairValue: number
}

/**
 * Renda residual — P/VP justificado.
 *
 * `VPA × (ROE − g)/(k − g)`. A leitura é direta: a ação vale mais que o
 * patrimônio na exata medida em que o retorno sobre esse patrimônio supera o
 * retorno exigido. ROE igual a k devolve P/VP de 1; ROE abaixo de k devolve menos
 * que o patrimônio, o que é a conclusão certa e a que os modelos de fluxo sobre
 * lucro escondem.
 *
 * É o modelo próprio de banco, seguradora e holding. Para instituição financeira
 * a dívida é insumo da operação, não financiamento: FCFF, EBITDA e capital de giro
 * não se definem, e restam os modelos de equity. Entre eles, a renda residual usa
 * a base mais estável que um banco tem — o patrimônio — e mede o que a gestão
 * consegue extrair dele.
 *
 * Fecha com o desconto de dividendos: aplicando Gordon ao lucro por ação com
 * retenção `g/ROE`, `P = VPA × (ROE − g)/(k − g)` é a mesma expressão.
 */
export class ResidualIncomeModel implements ValuationModel<ResidualIncomeInput> {
  readonly name = 'renda-residual'

  evaluate(input: ResidualIncomeInput): ValuationResult {
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

  project(input: ResidualIncomeProjection): ResidualIncomeBreakdown {
    const { bookValuePerShare, returnOnEquity, discountRate: k, payout } = input

    if (!Number.isFinite(bookValuePerShare) || bookValuePerShare <= 0) {
      throw new ValuationError(
        'O valor patrimonial por ação precisa ser positivo: é a base deste modelo.',
      )
    }
    if (!Number.isFinite(returnOnEquity)) {
      throw new ValuationError('O ROE precisa ser um número.')
    }
    if (!Number.isFinite(payout) || payout < 0 || payout > 1) {
      throw new ValuationError('O payout precisa ficar entre 0% e 100%.')
    }
    if (!Number.isFinite(k) || k <= 0) {
      throw new ValuationError('A taxa de desconto precisa ser positiva.')
    }

    const override = input.growthRate
    if (override != null && !Number.isFinite(override)) {
      throw new ValuationError('O crescimento precisa ser um número.')
    }
    const requestedGrowthRate = override ?? sustainableGrowth(returnOnEquity, payout)

    /**
     * O g aqui é perpétuo: a fórmula fechada supõe crescimento constante para
     * sempre, então ele não pode passar do crescimento de longo prazo da
     * economia — o mesmo limite de 3% da perpetuidade dos modelos de fluxo.
     *
     * Sem este limite o modelo explode perto de k. Medido: PINE4 com g truncado
     * em k − 1pp devolvia P/VP justificado de 11 e teto de R$ 106 contra preço de
     * R$ 10, primeiro lugar do ranking por causa do denominador (k − g) → 0,01.
     */
    const growthRate = Math.min(requestedGrowthRate, PERPETUAL_GROWTH)
    const growthCapped = requestedGrowthRate > PERPETUAL_GROWTH

    // (ROE − g)/(k − g) exige k > g: com g ≥ k o múltiplo troca de sinal ou
    // explode, e crescer para sempre acima do retorno exigido não é premissa,
    // é aritmética quebrada.
    if (growthRate >= k) {
      throw new ValuationError(
        'O crescimento não pode alcançar a taxa de desconto: com g ≥ k o múltiplo de patrimônio deixa de existir.',
      )
    }
    // ROE abaixo de g significa crescer sem gerar retorno para sustentar o
    // crescimento — o modelo devolveria patrimônio negativo de valor.
    if (returnOnEquity <= growthRate) {
      throw new ValuationError(
        'O ROE precisa ser maior que o crescimento: crescer acima do próprio retorno exigiria capital externo permanente.',
      )
    }

    const justifiedPriceToBook = (returnOnEquity - growthRate) / (k - growthRate)

    return {
      bookValuePerShare,
      returnOnEquity,
      discountRate: k,
      growthRate,
      growthOverridden: override != null,
      requestedGrowthRate,
      growthCapped,
      excessReturn: returnOnEquity - k,
      justifiedPriceToBook,
      fairValue: bookValuePerShare * justifiedPriceToBook,
    }
  }
}

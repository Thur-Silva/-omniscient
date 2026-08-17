import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'

/** Yield exigido padrão do método: os 6% do livro. */
export const BAZIN_REQUIRED_YIELD = 0.06

/** Faixa aceita para o yield exigido, como fração. */
export const BAZIN_YIELD_RANGE = { min: 0.02, max: 0.2 } as const

/**
 * Teto de yield corrente aceito como base recorrente de dividendo.
 *
 * Acima disto o dividendo dos 12 meses não é ordinário: é venda de ativo,
 * distribuição de reserva ou dado defasado contra um preço que já caiu. Qualquer
 * método baseado em dividendo multiplicaria o evento — Bazin por 1/yield, o DDM
 * pela perpetuidade — e devolveria teto ficcional. Medido em GRND3, cujo DY de 12
 * meses é de 36,7% na fonte e produzia teto de R$ 22 contra preço de R$ 3,60. É o
 * mesmo raciocínio do teto de DY no ranking de FIIs.
 *
 * A regra é de qualidade de dado, então quem a aplica é a camada que deriva o DPA
 * da fonte (`domain/stock/ceiling.ts`), não o modelo: um DPA informado à mão, ou
 * a média de cinco anos, é premissa do usuário e passa direto.
 */
export const MAX_TRAILING_DIVIDEND_YIELD = 0.2

export interface BazinProjection {
  /**
   * Dividendo por ação usado como base, em reais. O método original pede a média
   * dos últimos 5 anos; com só 12 meses disponíveis, o teto fica exposto a
   * dividendo extraordinário, e quem chama informa qual base usou.
   */
  dividendPerShare: number
  /** Yield que o investidor exige, como fração: 0,06 é 6%. */
  requiredYield: number
}

export interface BazinInput extends BazinProjection {
  marketPrice: number
}

export interface BazinBreakdown {
  dividendPerShare: number
  requiredYield: number
  /** Preço teto: o preço máximo que ainda entrega o yield exigido. */
  fairValue: number
  /** Yield que o preço de mercado entrega hoje; null sem preço. */
  currentYield: number | null
}

/**
 * Teto por yield exigido — o método de Décio Bazin.
 *
 * `DPA ÷ yield exigido`. Não é desconto de fluxo: é a inversão de uma exigência
 * de renda. Se você exige 6% de dividendo, um papel que paga R$ 1,50 por ação só
 * serve até R$ 25 — acima disso o mesmo dividendo rende menos do que você aceita.
 *
 * O lugar do método é a pagadora consistente, onde a pergunta relevante é de
 * renda e não de crescimento. Fora daí ele engana nos dois sentidos: ignora
 * reinvestimento (subestima quem cresce) e trata dividendo extraordinário como
 * recorrente (superestima quem vendeu um ativo). Bazin exigia justamente
 * consistência: dividendos por cinco anos seguidos, sem sustos.
 */
export class BazinModel implements ValuationModel<BazinInput> {
  readonly name = 'bazin'

  evaluate(input: BazinInput): ValuationResult {
    if (input.marketPrice <= 0) {
      throw new ValuationError('marketPrice deve ser positivo')
    }
    const breakdown = this.project(input, input.marketPrice)
    return {
      model: this.name,
      fairValue: breakdown.fairValue,
      safetyMargin: calculateSafetyMargin(breakdown.fairValue, input.marketPrice),
      marketPrice: input.marketPrice,
      asOf: new Date().toISOString(),
    }
  }

  project(input: BazinProjection, marketPrice: number | null = null): BazinBreakdown {
    const { dividendPerShare, requiredYield } = input

    if (!Number.isFinite(dividendPerShare) || dividendPerShare <= 0) {
      throw new ValuationError(
        'O dividendo por ação precisa ser positivo: sem dividendo não há teto por yield.',
      )
    }
    if (
      !Number.isFinite(requiredYield) ||
      requiredYield < BAZIN_YIELD_RANGE.min ||
      requiredYield > BAZIN_YIELD_RANGE.max
    ) {
      throw new ValuationError(
        `O yield exigido precisa ficar entre ${(BAZIN_YIELD_RANGE.min * 100).toFixed(0)}% e ${(BAZIN_YIELD_RANGE.max * 100).toFixed(0)}%.`,
      )
    }

    const currentYield =
      marketPrice != null && marketPrice > 0 ? dividendPerShare / marketPrice : null

    return {
      dividendPerShare,
      requiredYield,
      fairValue: dividendPerShare / requiredYield,
      currentYield,
    }
  }
}

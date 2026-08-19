import { ValuationError } from '../../errors/valuation-error'
import type { ValuationModel, ValuationResult } from '../types'
import { calculateSafetyMargin } from './safety-margin'
import { EXPLICIT_YEARS, PERPETUAL_GROWTH } from './two-phase-dcf'

/**
 * Fluxo de caixa livre da firma (FCFF), descontado ao WACC.
 *
 * O outro modelo de fluxo desta pasta desconta o que chega ao acionista (FCFE) ao
 * custo de capital próprio. Este desconta o que chega a **todos os investidores** —
 * acionista e credor — ao custo médio ponderado de capital, e só depois separa o
 * que é do acionista, subtraindo a dívida líquida:
 *
 *     FCFFₜ = EBITₜ × (1 − t) × (1 − taxa de reinvestimento)
 *     Firma = Σ FCFFₜ/(1+WACC)ᵗ + [FCFF₄/(WACC − g∞)]/(1+WACC)³
 *     Ação  = (Firma − dívida líquida) ÷ ações
 *
 * Casar fluxo com taxa é o ponto: FCFF é caixa antes do serviço da dívida, então
 * quem o desconta tem de exigir o retorno dos dois financiadores, ponderado pelo
 * que cada um pôs. Descontar FCFF a Ke exigiria do caixa da firma o retorno do
 * acionista sobre a dívida também, e subestimaria a empresa alavancada; descontar
 * FCFE a WACC faz o inverso.
 *
 * ### A taxa de reinvestimento, e por que ela é a trava daqui
 *
 * Crescer exige capital: giro, imobilizado, aquisição. A relação é a mesma do FCFE,
 * um andar acima na estrutura de capital — lá o crescimento vem da retenção de
 * lucro ao ROE, aqui vem do reinvestimento no capital investido ao ROIC:
 *
 *     g = ROIC × taxa de reinvestimento   ⟹   reinvestimento = g / ROIC
 *
 * Sem a trava, projetar EBIT crescendo e descontar o resultado operacional inteiro
 * daria à empresa crescimento de graça. Com ela, quanto maior o `g` pedido, menor
 * o fluxo livre daquele ano — e uma empresa que cresce acima do próprio ROIC não
 * gera caixa nenhum para distribuir, o que é o que a economia diz.
 *
 * ### Onde este modelo falha
 *
 * EBIT dos últimos 12 meses extrapolado por três anos tem o mesmo defeito de
 * qualquer projeção sobre resultado corrente: em cíclica de commodity projeta pico
 * ou fundo de ciclo. E o valor do acionista sai por diferença, então dívida líquida
 * errada na fonte contamina o teto na razão da alavancagem — numa empresa com
 * dívida do tamanho da capitalização, 10% de erro na dívida é 20% de erro no teto.
 */

/** Taxa de reinvestimento exigida para crescer `g` com retorno `ROIC`. */
export function reinvestmentRate(growthRate: number, returnOnInvestedCapital: number): number {
  if (growthRate <= 0) return 0
  if (returnOnInvestedCapital <= 0) return 1
  return Math.min(1, growthRate / returnOnInvestedCapital)
}

export interface TwoPhaseFcffProjection {
  /** Resultado operacional dos últimos 12 meses, em reais. */
  ebit: number
  /** Alíquota efetiva sobre o resultado operacional, como fração. */
  taxRate: number
  /** Retorno sobre o capital investido, como fração. Define o reinvestimento. */
  returnOnInvestedCapital: number
  /** Dívida líquida em reais. Negativo é caixa líquido, e aumenta o valor da ação. */
  netDebt: number
  sharesOutstanding: number
  /** WACC, como fração. */
  discountRate: number
  /** g da fase explícita, como fração. */
  growthRate: number
  /** Sobrescrita de g por ano; `null`/omissão usa `growthRate`. */
  growthRates?: (number | null | undefined)[]
  /** g pedido para a perpetuidade. O modelo limita em `PERPETUAL_GROWTH`. */
  perpetualGrowth?: number | null
}

export interface TwoPhaseFcffInput extends TwoPhaseFcffProjection {
  marketPrice: number
}

export interface ProjectedFirmYear {
  year: number
  /** EBIT projetado do ano. */
  ebit: number
  /** EBIT depois do imposto: `EBIT × (1 − t)`. */
  afterTaxEbit: number
  /** Fração do resultado operacional que volta para o negócio: `g / ROIC`. */
  reinvestmentRate: number
  /** Caixa livre da firma no ano: `EBIT(1 − t) × (1 − reinvestimento)`. */
  fcff: number
  presentValue: number
  growthRate: number
  discountRate: number
}

export interface TwoPhaseFcffBreakdown {
  years: ProjectedFirmYear[]
  explicitPresentValue: number
  /** EBIT do primeiro ano da perpetuidade. */
  terminalEbit: number
  terminalReinvestmentRate: number
  terminalFcff: number
  /** Valor da perpetuidade medido na data do último ano explícito. */
  terminalValue: number
  terminalPresentValue: number
  /** Valor da firma: as duas fases somadas. */
  enterpriseValue: number
  netDebt: number
  /** O que sobra para o acionista: firma menos dívida líquida. */
  equityValue: number
  sharesOutstanding: number
  /** O preço teto: valor do acionista dividido pelas ações. */
  fairValue: number
  explicitShare: number
  terminalShare: number
  /** Peso da dívida líquida sobre o valor da firma, como fração. */
  netDebtShare: number
  /** WACC aplicado, como fração. */
  discountRate: number
  taxRate: number
  returnOnInvestedCapital: number
  growthRate: number
  perpetualGrowthRate: number
  requestedPerpetualGrowth: number
  perpetualGrowthCapped: boolean
}

export class TwoPhaseFcffModel implements ValuationModel<TwoPhaseFcffInput> {
  readonly name = 'fcff-2-fases'

  evaluate(input: TwoPhaseFcffInput): ValuationResult {
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

  /** Cálculo completo, com a memória de cada etapa para a tela poder mostrar. */
  project(input: TwoPhaseFcffProjection): TwoPhaseFcffBreakdown {
    const {
      ebit,
      taxRate,
      returnOnInvestedCapital: roic,
      netDebt,
      sharesOutstanding,
      discountRate: wacc,
      growthRate,
    } = input

    if (!Number.isFinite(ebit) || ebit <= 0) {
      throw new ValuationError(
        'O EBIT precisa ser positivo: sem resultado operacional não há fluxo da firma a descontar.',
      )
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate >= 1) {
      throw new ValuationError('A alíquota de imposto precisa ficar entre 0% e 100%.')
    }
    if (!Number.isFinite(roic) || roic <= 0) {
      throw new ValuationError(
        'O ROIC precisa ser positivo: é ele que diz quanto capital o crescimento consome.',
      )
    }
    if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
      throw new ValuationError('O número de ações precisa ser positivo.')
    }
    if (!Number.isFinite(netDebt)) {
      throw new ValuationError('A dívida líquida precisa ser um número.')
    }
    if (!Number.isFinite(growthRate) || growthRate <= -1) {
      throw new ValuationError('O crescimento da fase explícita precisa ser maior que −100%.')
    }
    // Mesma guarda do FCFE, um andar acima: a perpetuidade divide por (WACC − g).
    if (!Number.isFinite(wacc) || wacc <= PERPETUAL_GROWTH) {
      throw new ValuationError(
        `O WACC precisa ser maior que o crescimento perpétuo de ${(PERPETUAL_GROWTH * 100).toFixed(0)}%.`,
      )
    }

    const requestedPerpetualGrowth = input.perpetualGrowth ?? PERPETUAL_GROWTH
    if (!Number.isFinite(requestedPerpetualGrowth) || requestedPerpetualGrowth <= -1) {
      throw new ValuationError('O crescimento perpétuo precisa ser maior que −100%.')
    }
    const perpetualGrowthRate = Math.min(PERPETUAL_GROWTH, requestedPerpetualGrowth)
    const perpetualGrowthCapped = requestedPerpetualGrowth > PERPETUAL_GROWTH

    /**
     * ROIC abaixo do crescimento perpétuo não é empresa sem valor: é modelo fora de
     * domínio. Com `g∞ ≥ ROIC` a taxa de reinvestimento da perpetuidade fecha em
     * 100%, o valor terminal vira zero e o teto sai quase todo negativo — foi o que
     * aconteceu com VALE3, cuja fonte reporta ROIC de 1,6%. Recusar é mais honesto
     * que devolver um teto que só diz que a conta não se aplica.
     */
    if (roic <= perpetualGrowthRate) {
      throw new ValuationError(
        `O ROIC de ${(roic * 100).toFixed(1)}% é menor que o crescimento perpétuo de ${(perpetualGrowthRate * 100).toFixed(0)}%: crescer para sempre exigiria reinvestir mais do que a firma gera, e o fluxo da firma não se resolve por este caminho.`,
      )
    }

    const years: ProjectedFirmYear[] = []
    let previousEbit = ebit
    for (let year = 1; year <= EXPLICIT_YEARS; year += 1) {
      const override = input.growthRates?.[year - 1]
      let yearGrowth = growthRate
      if (override != null) {
        if (!Number.isFinite(override) || override <= -1) {
          throw new ValuationError(`O crescimento do ano ${year} precisa ser maior que −100%.`)
        }
        yearGrowth = override
      }
      const projected = previousEbit * (1 + yearGrowth)
      const reinvestment = reinvestmentRate(yearGrowth, roic)
      const fcff = projected * (1 - taxRate) * (1 - reinvestment)
      years.push({
        year,
        ebit: projected,
        afterTaxEbit: projected * (1 - taxRate),
        reinvestmentRate: reinvestment,
        fcff,
        presentValue: fcff / (1 + wacc) ** year,
        growthRate: yearGrowth,
        discountRate: wacc,
      })
      previousEbit = projected
    }
    const explicitPresentValue = years.reduce((sum, entry) => sum + entry.presentValue, 0)

    const lastEbit = years[years.length - 1].ebit
    const terminalEbit = lastEbit * (1 + perpetualGrowthRate)
    const terminalReinvestmentRate = reinvestmentRate(perpetualGrowthRate, roic)
    const terminalFcff = terminalEbit * (1 - taxRate) * (1 - terminalReinvestmentRate)
    const terminalValue = terminalFcff / (wacc - perpetualGrowthRate)
    const terminalPresentValue = terminalValue / (1 + wacc) ** EXPLICIT_YEARS

    const enterpriseValue = explicitPresentValue + terminalPresentValue
    const equityValue = enterpriseValue - netDebt

    // Firma que vale menos que a própria dívida não tem preço teto por este
    // caminho: o resultado seria negativo, e "teto negativo" não é informação de
    // preço, é sinal de que o caso é de reestruturação.
    if (equityValue <= 0) {
      throw new ValuationError(
        'A dívida líquida consome todo o valor da firma neste modelo: não há valor de acionista a dividir pelas ações.',
      )
    }

    return {
      years,
      explicitPresentValue,
      terminalEbit,
      terminalReinvestmentRate,
      terminalFcff,
      terminalValue,
      terminalPresentValue,
      enterpriseValue,
      netDebt,
      equityValue,
      sharesOutstanding,
      fairValue: equityValue / sharesOutstanding,
      explicitShare: explicitPresentValue / enterpriseValue,
      terminalShare: terminalPresentValue / enterpriseValue,
      netDebtShare: netDebt / enterpriseValue,
      discountRate: wacc,
      taxRate,
      returnOnInvestedCapital: roic,
      growthRate,
      perpetualGrowthRate,
      requestedPerpetualGrowth,
      perpetualGrowthCapped,
    }
  }
}

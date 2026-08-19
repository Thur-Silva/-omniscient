import {
  CORPORATE_TAX_RATE,
  costOfDebt,
  costOfEquity,
  weightedAverageCostOfCapital,
  type CapmBreakdown,
  type CostOfDebtBreakdown,
  type WaccBreakdown,
} from '../valuation/cost-of-capital'
import { resolveBeta, type BetaEstimate } from './beta'
import type { StockFundamentals } from './fundamentals'
import { structuralFamily } from './method-selection'

/**
 * As duas taxas de um ativo, calculadas a partir dos dados da fonte.
 *
 * É a cola entre `valuation/cost-of-capital` (as fórmulas) e os fundamentos (os
 * números): monta o beta do setor, relavanca, aplica o CAPM e — quando a estrutura
 * de capital é conhecida e faz sentido — pondera com o custo da dívida.
 */

export interface RatePremises {
  /** Taxa livre de risco nominal, como fração. */
  riskFreeRate: number
  /** Alíquota para o benefício fiscal da dívida e para Hamada. */
  taxRate?: number
  /** Prêmio adicional exigido pelo usuário: iliquidez, governança, controlador. */
  extraPremium?: number
  /** Beta digitado na tela, que substitui o do setor. */
  betaOverride?: number | null
  /** Spread de crédito digitado na tela, que substitui o degrau da escada. */
  debtSpreadOverride?: number | null
}

export interface StockCostOfCapital {
  beta: BetaEstimate
  capm: CapmBreakdown
  /** Ke: a taxa dos fluxos do acionista. */
  costOfEquity: number
  debt: CostOfDebtBreakdown | null
  /** WACC: a taxa do fluxo da firma. `null` quando não se aplica ou falta dado. */
  wacc: WaccBreakdown | null
  /** Por que não há WACC, quando não há — é o texto que a tela mostra. */
  waccUnavailable: string | null
}

/**
 * Ke e WACC deste ativo.
 *
 * O WACC fica indisponível em dois casos, e os dois são deliberados:
 *
 *  · **Instituição financeira.** Para banco e seguradora a dívida é matéria-prima,
 *    não financiamento: não existe "estrutura de capital ótima" a ponderar, e o
 *    valor da firma não é um conceito operacional. Aqui só Ke faz sentido, o que é
 *    a mesma razão pela qual estes ativos são avaliados por renda residual.
 *  · **Falta capitalização ou dívida líquida na fonte.** Sem os dois não há pesos,
 *    e inventar peso seria inventar a resposta.
 */
export function resolveStockCostOfCapital(
  stock: StockFundamentals,
  premises: RatePremises,
): StockCostOfCapital {
  const taxRate = premises.taxRate ?? CORPORATE_TAX_RATE
  const beta = resolveBeta(stock, { taxRate, override: premises.betaOverride ?? null })
  const capm = costOfEquity({
    riskFreeRate: premises.riskFreeRate,
    beta: beta.beta,
    extraPremium: premises.extraPremium ?? 0,
  })

  const family = structuralFamily(stock).family
  if (family === 'financeiro') {
    return {
      beta,
      capm,
      costOfEquity: capm.costOfEquity,
      debt: null,
      wacc: null,
      waccUnavailable:
        'Para instituição financeira a dívida é insumo, não financiamento: não há estrutura de capital a ponderar, então só o custo de capital próprio se aplica.',
    }
  }

  const debt = costOfDebt({
    riskFreeRate: premises.riskFreeRate,
    netDebtToEbit: stock.netDebtToEbit,
    spread: premises.debtSpreadOverride ?? undefined,
    taxRate,
  })

  if (stock.marketCap == null || stock.marketCap <= 0 || stock.netDebt == null) {
    return {
      beta,
      capm,
      costOfEquity: capm.costOfEquity,
      debt,
      wacc: null,
      waccUnavailable:
        'A fonte não trouxe capitalização e dívida líquida para este ativo, então não há como ponderar capital próprio e de terceiros.',
    }
  }

  return {
    beta,
    capm,
    costOfEquity: capm.costOfEquity,
    debt,
    wacc: weightedAverageCostOfCapital({
      capm,
      debt,
      equityValue: stock.marketCap,
      netDebt: stock.netDebt,
    }),
    waccUnavailable: null,
  }
}

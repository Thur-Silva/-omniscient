import type { CeilingMethodId } from './methods'
import type { BazinBreakdown } from './models/bazin'
import type { GrahamNumberBreakdown } from './models/graham-number'
import type { ResidualIncomeBreakdown } from './models/residual-income'
import type { TwoPhaseDcfBreakdown } from './models/two-phase-dcf'
import type { TwoPhaseDdmBreakdown } from './models/two-phase-ddm'

/**
 * Memória de cálculo de qualquer método, discriminada pelo método.
 *
 * União em vez de um shape comum porque as contas não são a mesma: o FCD tem ano
 * a ano e perpetuidade, o Bazin tem uma divisão, a renda residual tem um múltiplo
 * de patrimônio. Achatar tudo num formato só apagaria justamente o que a tela
 * precisa mostrar para o cálculo ser auditável.
 */
export type CeilingBreakdown =
  | { method: 'fcd-2-fases'; dcf: TwoPhaseDcfBreakdown }
  | { method: 'ddm-gordon'; ddm: TwoPhaseDdmBreakdown }
  | { method: 'bazin'; bazin: BazinBreakdown }
  | { method: 'renda-residual'; residual: ResidualIncomeBreakdown }
  | { method: 'numero-graham'; graham: GrahamNumberBreakdown }

/**
 * Premissas utilizadas num cálculo, no formato em que ficam salvas.
 *
 * Todos os campos são opcionais porque cada método usa um subconjunto: o Bazin
 * grava dividendo e yield exigido, o número de Graham grava LPA e VPA. O registro
 * guarda o que foi de fato usado, para o cálculo poder ser reproduzido depois.
 */
export interface CeilingSavedAssumptions {
  netIncome?: number
  payout?: number
  returnOnEquity?: number
  discountRate?: number
  sharesOutstanding?: number
  /** g por ano da fase explícita; `null` significa derivar de ROE × (1 − payout). */
  growthRates?: (number | null)[]
  perpetualGrowth?: number | null
  dividendPerShare?: number
  requiredYield?: number
  earningsPerShare?: number
  bookValuePerShare?: number
}

/** Método usado no cálculo salvo, para o histórico não confundir réguas. */
export type SavedCeilingMethod = CeilingMethodId

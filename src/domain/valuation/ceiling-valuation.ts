import type { TwoPhaseDcfBreakdown, TwoPhaseDcfProjection } from './models/two-phase-dcf'

/**
 * Registro persistido de um preço teto calculado.
 *
 * O que a tela mostrou naquele momento fica registrado como estava: as premissas
 * utilizadas (inclusive os g sobrescritos por ano e o g perpétuo pedido, antes
 * do limite de 3%) e a memória de cálculo completa, para o cálculo ser
 * auditável depois, quando os fundamentos da fonte já tiverem mudado.
 */
export interface CeilingValuation {
  id: string
  /** Dono do cálculo: id do usuário do Clerk. */
  userId: string
  ticker: string
  /** Preço de mercado no momento do cálculo; null quando não havia preço. */
  marketPrice: number | null
  /** Preço teto por ação. */
  ceilingPrice: number
  /** Fração de desconto contra o mercado; null quando não havia preço. */
  safetyMargin: number | null
  /** Premissas utilizadas, já completas — o modelo só grava cálculo pronto. */
  assumptions: TwoPhaseDcfProjection
  /** Memória de cálculo: anos, perpetuidade (g limitado a 3%) e teto. */
  breakdown: TwoPhaseDcfBreakdown
  createdAt: string
}

export interface CeilingValuationRepository {
  /**
   * Grava (ou atualiza) o cálculo de um ativo: existe no máximo um registro por
   * `userId` + `ticker`, então salvar de novo o mesmo ativo sobrescreve o
   * anterior em vez de duplicar.
   */
  save(record: Omit<CeilingValuation, 'id' | 'createdAt'>): Promise<CeilingValuation>
  /** Histórico do usuário, do cálculo mais recente para o mais antigo. */
  list(userId: string, signal?: AbortSignal): Promise<CeilingValuation[]>
  /** Um cálculo salvo do usuário; `null` quando não existe ou não é dele. */
  get(id: string, userId: string, signal?: AbortSignal): Promise<CeilingValuation | null>
}
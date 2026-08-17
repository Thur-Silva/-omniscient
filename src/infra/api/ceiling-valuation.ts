import type {
  CeilingValuation,
  CeilingValuationRepository,
} from '../../domain/valuation/ceiling-valuation'
import type { HttpClient } from '../http/client'

/**
 * Histórico de preços teto no nosso servidor.
 *
 * O cálculo continua acontecendo no browser; o servidor só guarda o que a tela
 * calculou — teto, premissas e memória de cálculo — na tabela `ceiling_valuation`.
 */
export class CeilingValuationApi implements CeilingValuationRepository {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async save(record: Omit<CeilingValuation, 'id' | 'createdAt'>): Promise<CeilingValuation> {
    return this.http.post<CeilingValuation>('/ceiling', record)
  }

  async list(userId: string): Promise<CeilingValuation[]> {
    return this.http.get<CeilingValuation[]>('/ceiling', { query: { user: userId } })
  }
}
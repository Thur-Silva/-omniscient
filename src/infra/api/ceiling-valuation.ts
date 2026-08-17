import type {
  CeilingValuation,
  CeilingValuationRepository,
} from '../../domain/valuation/ceiling-valuation'
import { HttpClient, HttpError } from '../http/client'

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

  async list(userId: string, signal?: AbortSignal): Promise<CeilingValuation[]> {
    return this.http.get<CeilingValuation[]>('/ceiling', { query: { user: userId }, signal })
  }

  async get(id: string, userId: string, signal?: AbortSignal): Promise<CeilingValuation | null> {
    try {
      return await this.http.get<CeilingValuation>(`/ceiling/${encodeURIComponent(id)}`, {
        query: { user: userId },
        signal,
      })
    } catch (cause) {
      // Cálculo que não existe (ou não é do usuário) é ausência, não erro.
      if (cause instanceof HttpError && cause.isNotFound) return null
      throw cause
    }
  }
}
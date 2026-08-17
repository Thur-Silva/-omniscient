import type { RankingMode, StockRanking } from '../../domain/stock/ranking'
import type { HttpClient } from '../http/client'

/**
 * Ranking de ações servido pelo nosso próprio servidor.
 *
 * O cálculo não acontece no browser: o servidor monta e guarda o resultado no
 * banco, então o cliente só lê. É o que permite que a fonte externa não seja
 * tocada dentro da janela de 10 minutos, por mais usuários que peçam.
 */
export class StockRankingApi {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async fetch(
    request: { discountRate: number; mode: RankingMode; requiredYield: number },
    signal?: AbortSignal,
  ): Promise<StockRanking> {
    return this.http.get<StockRanking>('/acoes', {
      // Em pontos percentuais, arredondado: o servidor normaliza de novo, e a
      // chave de cache precisa ser estável entre chamadas iguais.
      query: {
        k: Number((request.discountRate * 100).toFixed(1)),
        m: request.mode,
        dy: Number((request.requiredYield * 100).toFixed(1)),
      },
      signal,
    })
  }
}

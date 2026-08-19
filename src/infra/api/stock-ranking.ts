import type { RankingMode, RateMode, StockRanking } from '../../domain/stock/ranking'
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
    request: {
      discountRate: number
      mode: RankingMode
      requiredYield: number
      rateMode: RateMode
    },
    signal?: AbortSignal,
  ): Promise<StockRanking> {
    return this.http.get<StockRanking>('/acoes', {
      // Em pontos percentuais, arredondado: o servidor normaliza de novo, e a
      // chave de cache precisa ser estável entre chamadas iguais. A taxa livre de
      // risco não vai daqui — quem a lê do Banco Central é o servidor, que já tem
      // o cache; mandá-la do browser deixaria a chave à mercê do cliente.
      query: {
        k: Number((request.discountRate * 100).toFixed(1)),
        m: request.mode,
        dy: Number((request.requiredYield * 100).toFixed(1)),
        r: request.rateMode,
      },
      signal,
    })
  }
}

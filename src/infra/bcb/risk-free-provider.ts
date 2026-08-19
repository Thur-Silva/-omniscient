import type { RiskFreeRate, RiskFreeRateProvider } from '../../domain/market/risk-free'
import type { HttpClient } from '../http/client'
import { parseSelic, SELIC_PATH, SELIC_QUERY } from './selic'

/**
 * Taxa livre de risco lida do Banco Central.
 *
 * Vai pelo mesmo proxy de servidor das outras fontes, então ganha a janela de cache
 * de 10 minutos no banco: a Selic muda por decisão do Copom, não por minuto, e não
 * há razão para consultar a série a cada abertura de tela. A série e a leitura estão
 * em `selic.ts`, que o servidor também usa para montar o ranking com a mesma chave.
 */
export class BcbRiskFreeRateProvider implements RiskFreeRateProvider {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async current(signal?: AbortSignal): Promise<RiskFreeRate | null> {
    const response = await this.http.get<unknown>(SELIC_PATH, { query: SELIC_QUERY, signal })
    return parseSelic(response)
  }
}

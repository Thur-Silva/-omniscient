import type {
  DividendHistory,
  DividendHistoryProvider,
} from '../../domain/stock/dividend-history'
import { HttpClient, HttpError } from '../http/client'

/**
 * Resposta de `/acao/companytickerprovents`.
 *
 * Endpoint interno do StatusInvest, o mesmo que alimenta o gráfico de proventos
 * do site. `assetEarningsYearlyModels` traz um ponto por ano, com o ano em `rank`
 * e o total por ação em `value`. Conferido em 17/08/2026: BBAS3 devolve série
 * desde 2007, SAPR11 desde 2017.
 */
interface ProventsResponse {
  assetEarningsYearlyModels?: { rank: number | null; value: number | null }[]
}

/** `chartProventsType=2` é a série anual; 1 devolve a mensal. */
const YEARLY_SERIES = 2

/**
 * Histórico anual de proventos do StatusInvest.
 *
 * Uma requisição por ticker, então só é usado na calculadora de um ativo. Vai pelo
 * mesmo proxy dos fundamentos, o que faz cada ticker ganhar sua própria janela de
 * cache de 10 minutos no banco em vez de bater na fonte a cada abertura de tela.
 */
export class StatusInvestDividendHistoryProvider implements DividendHistoryProvider {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async find(ticker: string, signal?: AbortSignal): Promise<DividendHistory | null> {
    const clean = ticker.trim().toUpperCase()
    if (clean === '') return null

    try {
      const response = await this.http.get<ProventsResponse>('/acao/companytickerprovents', {
        query: { ticker: clean, chartProventsType: YEARLY_SERIES },
        signal,
      })

      const years = (response.assetEarningsYearlyModels ?? [])
        .filter(
          (entry): entry is { rank: number; value: number } =>
            typeof entry?.rank === 'number' &&
            Number.isFinite(entry.rank) &&
            typeof entry.value === 'number' &&
            Number.isFinite(entry.value),
        )
        .map((entry) => ({ year: entry.rank, dividendPerShare: entry.value }))
        .sort((a, b) => a.year - b.year)

      if (years.length === 0) return null
      return { ticker: clean, years }
    } catch (cause) {
      // Ativo sem série de proventos é ausência de dado, não falha de leitura.
      if (cause instanceof HttpError && cause.isNotFound) return null
      throw cause
    }
  }
}

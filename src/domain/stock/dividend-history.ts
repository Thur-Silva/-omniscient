/**
 * Histórico de proventos por ação.
 *
 * Existe porque o método de Bazin não é sobre o dividendo de agora: é sobre o
 * dividendo que a empresa provou pagar. O original pede a média dos últimos cinco
 * anos justamente para o extraordinário de um exercício não virar premissa
 * permanente. Com só o DY de 12 meses, o teto herda o evento do período.
 *
 * A porta é separada da de fundamentos porque o custo é outro: fundamentos vêm do
 * universo inteiro numa requisição, e o histórico exige uma requisição por ticker.
 * Por isso ele alimenta a calculadora de um ativo, não o ranking de 600.
 */

export interface AnnualDividend {
  year: number
  /** Soma dos proventos por ação declarados no ano, em reais. */
  dividendPerShare: number
}

export interface DividendHistory {
  ticker: string
  /** Do ano mais antigo para o mais recente, como a fonte devolve. */
  years: AnnualDividend[]
}

export interface DividendHistoryProvider {
  find(ticker: string, signal?: AbortSignal): Promise<DividendHistory | null>
}

/** Anos usados na média do método original. */
export const BAZIN_HISTORY_YEARS = 5

export interface DividendAverage {
  /** Média por ação dos anos considerados. */
  average: number
  years: AnnualDividend[]
  /** `true` quando havia menos que os cinco anos pedidos pelo método. */
  incomplete: boolean
}

/**
 * Média dos últimos cinco exercícios encerrados.
 *
 * O ano corrente é excluído porque está pela metade: incluí-lo puxaria a média
 * para baixo por um motivo de calendário, não de política de dividendos. Anos sem
 * pagamento entram como zero — a ausência é informação, e o método de Bazin
 * justamente exclui quem não paga com consistência.
 */
export function averageDividend(
  history: DividendHistory,
  currentYear: number,
  years = BAZIN_HISTORY_YEARS,
): DividendAverage | null {
  const closed = history.years
    .filter((entry) => entry.year < currentYear)
    .sort((a, b) => b.year - a.year)
    .slice(0, years)

  if (closed.length === 0) return null

  const total = closed.reduce((sum, entry) => sum + entry.dividendPerShare, 0)
  return {
    average: total / closed.length,
    years: [...closed].sort((a, b) => a.year - b.year),
    incomplete: closed.length < years,
  }
}

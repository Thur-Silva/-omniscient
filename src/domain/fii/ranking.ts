import type { FiiFundamentals } from './fundamentals'

/**
 * Critérios de elegibilidade. Um FII precisa passar em todos para ser ranqueado.
 */
export const CRITERIA = {
  /** Abaixo disso não aparece: não há como entrar nem sair da posição. */
  minDailyLiquidity: 1_000_000,
  /**
   * Teto de DY. Acima disso a distribuição costuma ser insustentável — venda de
   * ativo, resultado não recorrente ou erro de dado. É filtro de armadilha, não
   * de qualidade.
   */
  maxDividendYield: 16,
  /** Piso de P/VP: desconto exagerado normalmente esconde problema no ativo. */
  minPriceToBook: 0.8,
  /** Teto de P/VP: acima disso paga-se prêmio sobre o patrimônio. */
  maxPriceToBook: 1.05,
} as const

export type RejectionReason =
  | 'sem-dados'
  | 'liquidez-baixa'
  | 'dy-nulo'
  | 'dy-acima-do-teto'
  | 'pvp-fora-da-faixa'

export interface RankedFii {
  fundamentals: FiiFundamentals
  /** Colocação no ranking de DY, do maior para o menor. 1 é o melhor. */
  dividendYieldRank: number
  /** Colocação no ranking de P/VP, do menor para o maior. 1 é o melhor. */
  priceToBookRank: number
  /** Soma das duas colocações. Menor é melhor. */
  score: number
  /** Posição final, já com a soma ordenada. */
  position: number
}

export interface RejectedFii {
  fundamentals: FiiFundamentals
  reason: RejectionReason
}

export interface OpportunityRanking {
  ranked: RankedFii[]
  rejected: RejectedFii[]
  universeSize: number
  rejectedByReason: Record<RejectionReason, number>
}

function reject(fii: FiiFundamentals): RejectionReason | null {
  const { dividendYield: dy, priceToBook: pvp, averageDailyLiquidity: liquidity } = fii

  if (dy == null || pvp == null || liquidity == null) return 'sem-dados'
  if (liquidity < CRITERIA.minDailyLiquidity) return 'liquidez-baixa'
  if (dy <= 0) return 'dy-nulo'
  if (dy > CRITERIA.maxDividendYield) return 'dy-acima-do-teto'
  if (pvp < CRITERIA.minPriceToBook || pvp > CRITERIA.maxPriceToBook) return 'pvp-fora-da-faixa'
  return null
}

/**
 * Ranqueia FIIs somando duas colocações independentes.
 *
 * Primeiro ordena por DY do maior para o menor e dá 1 ponto ao primeiro, 2 ao
 * segundo e assim por diante. Depois faz o mesmo por P/VP, do menor para o maior
 * — mais barato sobre o patrimônio é melhor. Soma as duas colocações de cada
 * fundo e ordena crescente: **menor soma é o melhor colocado**.
 *
 * Somar colocações em vez de olhar um índice só evita que um DY alto isolado, ou
 * um P/VP baixo isolado, carregue o fundo para o topo sozinho.
 *
 * Liquidez não entra na soma: ela é critério de corte (R$ 1 milhão) e, depois,
 * apenas um modo de ordenar a lista já ranqueada.
 */
export function rankOpportunities(universe: readonly FiiFundamentals[]): OpportunityRanking {
  const rejected: RejectedFii[] = []
  const rejectedByReason: Record<RejectionReason, number> = {
    'sem-dados': 0,
    'liquidez-baixa': 0,
    'dy-nulo': 0,
    'dy-acima-do-teto': 0,
    'pvp-fora-da-faixa': 0,
  }

  const eligible: FiiFundamentals[] = []
  for (const fii of universe) {
    const reason = reject(fii)
    if (reason == null) {
      eligible.push(fii)
    } else {
      rejected.push({ fundamentals: fii, reason })
      rejectedByReason[reason] += 1
    }
  }

  // As duas colocações são calculadas sobre o mesmo conjunto de aprovados, senão
  // as somas não seriam comparáveis entre si.
  const byYield = [...eligible].sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0))
  const yieldRank = new Map(byYield.map((fii, index) => [fii.ticker, index + 1]))

  const byPriceToBook = [...eligible].sort((a, b) => (a.priceToBook ?? 0) - (b.priceToBook ?? 0))
  const priceToBookRank = new Map(byPriceToBook.map((fii, index) => [fii.ticker, index + 1]))

  const ranked = eligible
    .map((fundamentals) => {
      const dividendYieldRank = yieldRank.get(fundamentals.ticker) ?? eligible.length
      const rank = priceToBookRank.get(fundamentals.ticker) ?? eligible.length
      return {
        fundamentals,
        dividendYieldRank,
        priceToBookRank: rank,
        score: dividendYieldRank + rank,
        position: 0,
      }
    })
    // Empate na soma vai para quem tem melhor colocação de DY, o critério primário.
    .sort((a, b) => a.score - b.score || a.dividendYieldRank - b.dividendYieldRank)
    .map((entry, index) => ({ ...entry, position: index + 1 }))

  return { ranked, rejected, universeSize: universe.length, rejectedByReason }
}

import type { FiiFundamentalsProvider } from '../../domain/fii/fundamentals'
import { rankOpportunities, type OpportunityRanking } from '../../domain/fii/ranking'

export interface OpportunityReport extends OpportunityRanking {
  fetchedAt: string
}

/**
 * Busca o universo de FIIs e aplica o ranking.
 *
 * A regra de elegibilidade e a soma das colocações vivem no domínio; aqui só
 * acontece a orquestração com a fonte de dados.
 */
export class FindFiiOpportunities {
  private readonly provider: FiiFundamentalsProvider

  constructor(provider: FiiFundamentalsProvider) {
    this.provider = provider
  }

  async execute(signal?: AbortSignal): Promise<OpportunityReport> {
    const universe = await this.provider.list(signal)
    return { ...rankOpportunities(universe), fetchedAt: new Date().toISOString() }
  }
}

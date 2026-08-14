import { LoadPortfolio } from '../application/portfolio/load-portfolio'
import type { QuoteProvider } from '../domain/asset/quote-provider'
import type { PositionRepository } from '../domain/portfolio/repository'
import { BrapiQuoteProvider } from '../infra/brapi/quote-provider'
import { appConfig } from '../infra/config/env'
import { HttpClient } from '../infra/http/client'
import { LocalStoragePositionRepository } from '../infra/repository/position'

/**
 * Composition root: o único lugar que conhece as implementações concretas.
 * A camada de apresentação consome as portas, não a infra.
 */

// O provedor de cotação não depende do usuário, então pode ser compartilhado.
const brapiHttp = new HttpClient({
  baseUrl: appConfig.brapiBaseUrl,
  timeoutMs: 15_000,
})

export const quoteProvider: QuoteProvider = new BrapiQuoteProvider(brapiHttp)

export interface PortfolioServices {
  positionRepository: PositionRepository
  loadPortfolio: LoadPortfolio
}

/**
 * A carteira é por usuário (id vindo do Clerk), então estes serviços são
 * construídos por sessão em vez de no carregamento do módulo.
 */
export function createPortfolioServices(userId: string): PortfolioServices {
  const positionRepository = new LocalStoragePositionRepository(userId)
  return {
    positionRepository,
    loadPortfolio: new LoadPortfolio(positionRepository, quoteProvider),
  }
}

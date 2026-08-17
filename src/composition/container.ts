import { FindFiiOpportunities } from '../application/fii/find-opportunities'
import { LoadPortfolio } from '../application/portfolio/load-portfolio'
import { ScreenWatchlist } from '../application/screener/screen-watchlist'
import { EstimatePriceCeiling } from '../application/stock/price-ceiling'
import { StatusInvestFiiProvider } from '../infra/statusinvest/fii-provider'
import { CeilingValuationApi } from '../infra/api/ceiling-valuation'
import { StockRankingApi } from '../infra/api/stock-ranking'
import { StatusInvestStockProvider } from '../infra/statusinvest/stock-provider'
import { StatusInvestDividendHistoryProvider } from '../infra/statusinvest/dividend-history-provider'
import type { QuoteProvider } from '../domain/asset/quote-provider'
import type { AssetUniverseProvider } from '../domain/asset/universe'
import type { PositionRepository } from '../domain/portfolio/repository'
import type { CeilingValuationRepository } from '../domain/valuation/ceiling-valuation'
import type { WatchlistRepository } from '../domain/watchlist/repository'
import { BrapiQuoteProvider } from '../infra/brapi/quote-provider'
import { BrapiUniverseProvider } from '../infra/brapi/universe-provider'
import { appConfig } from '../infra/config/env'
import { HttpClient } from '../infra/http/client'
import { LocalStoragePositionRepository } from '../infra/repository/position'
import { LocalStorageWatchlistRepository } from '../infra/repository/watchlist'

/**
 * Composition root: o único lugar que conhece as implementações concretas.
 * A camada de apresentação consome as portas, não a infra.
 */

// Provedores da brapi não dependem do usuário, então são compartilhados. O
// catálogo devolve 2000 itens por requisição, daí o timeout mais folgado.
const brapiHttp = new HttpClient({
  baseUrl: appConfig.brapiBaseUrl,
  timeoutMs: 15_000,
})

const universeHttp = new HttpClient({
  baseUrl: appConfig.brapiBaseUrl,
  timeoutMs: 25_000,
})

export const quoteProvider: QuoteProvider = new BrapiQuoteProvider(brapiHttp)
export const universeProvider: AssetUniverseProvider = new BrapiUniverseProvider(universeHttp)

// Fundamentos de FII vêm de outra fonte porque a brapi não os fornece neste
// plano. O universo inteiro chega numa requisição, daí o timeout maior.
const fundamentalsHttp = new HttpClient({
  baseUrl: appConfig.fundamentalsBaseUrl,
  timeoutMs: 30_000,
})

export const findFiiOpportunities = new FindFiiOpportunities(
  new StatusInvestFiiProvider(fundamentalsHttp),
)

// Ações saem do mesmo proxy, em outra categoria da busca avançada. O histórico de
// proventos vem do mesmo host, mas custa uma requisição por ticker: alimenta a
// calculadora de um ativo (média de 5 anos do Bazin), nunca o ranking.
export const estimatePriceCeiling = new EstimatePriceCeiling(
  new StatusInvestStockProvider(fundamentalsHttp),
  new StatusInvestDividendHistoryProvider(fundamentalsHttp),
)

// O ranking vem do nosso servidor, já calculado e guardado no banco. Timeout
// folgado porque a primeira chamada da janela ainda vai à fonte.
export const stockRankingApi = new StockRankingApi(
  new HttpClient({ baseUrl: appConfig.rankingBaseUrl, timeoutMs: 40_000 }),
)

// Histórico de preços teto: o browser calcula, o servidor guarda. Sem
// dependência de usuário no construtor — o id vai em cada chamada.
export const ceilingValuationRepository: CeilingValuationRepository = new CeilingValuationApi(
  new HttpClient({ baseUrl: appConfig.apiBaseUrl, timeoutMs: 10_000 }),
)

export interface UserServices {
  positionRepository: PositionRepository
  watchlistRepository: WatchlistRepository
  loadPortfolio: LoadPortfolio
  screenWatchlist: ScreenWatchlist
}

/**
 * Carteira e lista de observação são por usuário (id vindo do Clerk), então estes
 * serviços são construídos por sessão em vez de no carregamento do módulo.
 */
export function createUserServices(userId: string): UserServices {
  const positionRepository = new LocalStoragePositionRepository(userId)
  const watchlistRepository = new LocalStorageWatchlistRepository(userId)

  return {
    positionRepository,
    watchlistRepository,
    loadPortfolio: new LoadPortfolio(positionRepository, quoteProvider),
    screenWatchlist: new ScreenWatchlist(watchlistRepository, universeProvider),
  }
}

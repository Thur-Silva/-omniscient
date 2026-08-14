import type { AssetQuote } from './type'

/** Resultado por ticker: cotações são buscadas em lote e falham individualmente. */
export type QuoteOutcome =
  | { ticker: string; status: 'fulfilled'; quote: AssetQuote }
  | { ticker: string; status: 'rejected'; error: Error }

/**
 * Porta de saída para provedores de cotação (brapi, Yahoo, etc.).
 * O domínio depende desta interface, nunca de um provedor concreto.
 */
export interface QuoteProvider {
  getQuote(ticker: string, signal?: AbortSignal): Promise<AssetQuote>
  getQuotes(tickers: readonly string[], signal?: AbortSignal): Promise<QuoteOutcome[]>
}

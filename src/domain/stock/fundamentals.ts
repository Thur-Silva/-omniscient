/**
 * Fundamentos de uma ação, no que o modelo de preço teto precisa.
 *
 * Campos nulos são honestos: significam que a fonte não trouxe o dado e que o
 * usuário precisa preencher à mão. Nada aqui é estimado.
 */
export interface StockFundamentals {
  ticker: string
  name: string
  /** Rótulo curto de setor, para exibição. */
  sector: string | null
  /**
   * Taxonomia B3 em três níveis, como a fonte devolve. Não é enfeite: é o que
   * decide qual metodologia de preço teto se aplica ao ativo — banco não se
   * avalia como concessionária, e nenhuma das duas como cíclica de commodity.
   */
  sectorName: string | null
  subsectorName: string | null
  segmentName: string | null
  price: number | null
  /** Lucro líquido dos últimos 12 meses, em reais. */
  netIncome: number | null
  earningsPerShare: number | null
  /** Fração distribuída do lucro: 0,25 é 25%. */
  payout: number | null
  /** Retorno sobre patrimônio como fração: 0,0827 é 8,27%. */
  returnOnEquity: number | null
  sharesOutstanding: number | null
  bookValuePerShare: number | null
  priceToEarnings: number | null
  averageDailyLiquidity: number | null
  /** Dividend yield dos últimos 12 meses como fração: 0,0909 é 9,09%. */
  dividendYield: number | null
  /** Dividendo por ação dos últimos 12 meses, em reais. */
  dividendPerShare: number | null
  /** Crescimento anual composto da receita em 5 anos, como fração. */
  revenueCagr5: number | null
  /** Capitalização de mercado em reais: o peso do capital próprio no WACC. */
  marketCap: number | null
  /** Resultado operacional dos últimos 12 meses, em reais. Base do FCFF. */
  ebit: number | null
  /** Valor da firma em reais: capitalização mais dívida líquida, como a fonte vê. */
  enterpriseValue: number | null
  /** Dívida líquida em reais. Negativo é caixa líquido. */
  netDebt: number | null
  /** Dívida líquida sobre patrimônio líquido. Relavanca o beta do setor. */
  netDebtToEquity: number | null
  /** Dívida líquida sobre EBIT. Define o degrau de spread de crédito. */
  netDebtToEbit: number | null
  /** Retorno sobre o capital investido como fração: 0,1111 é 11,11%. */
  returnOnInvestedCapital: number | null
}

/**
 * Porta para fundamentos de ação.
 *
 * Separada de `FiiFundamentalsProvider` porque as métricas são outras: ação se
 * avalia por lucro, ROE e payout; FII, por patrimônio e distribuição.
 */
export interface StockFundamentalsProvider {
  /** Todas as ações conhecidas pela fonte, numa chamada. */
  list(signal?: AbortSignal): Promise<StockFundamentals[]>
  find(ticker: string, signal?: AbortSignal): Promise<StockFundamentals | null>
}

/** Nomes dos campos que o modelo exige, para a tela dizer o que falta. */
export const REQUIRED_FOR_CEILING = [
  'netIncome',
  'payout',
  'returnOnEquity',
  'sharesOutstanding',
] as const satisfies readonly (keyof StockFundamentals)[]

export function missingForCeiling(fundamentals: StockFundamentals): string[] {
  const labels: Record<(typeof REQUIRED_FOR_CEILING)[number], string> = {
    netIncome: 'lucro líquido',
    payout: 'payout',
    returnOnEquity: 'ROE',
    sharesOutstanding: 'número de ações',
  }
  return REQUIRED_FOR_CEILING.filter((field) => fundamentals[field] == null).map(
    (field) => labels[field],
  )
}

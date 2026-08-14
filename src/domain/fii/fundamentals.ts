/**
 * Como o fundo ganha dinheiro. É a divisão que o investidor usa para diversificar.
 *
 * `outros` cobre o que a fonte classifica fora das três (financeiro, industrial,
 * consumo cíclico) — existe para nada ficar invisível no ranking.
 */
export type FiiCategory = 'papel' | 'tijolo' | 'misto' | 'outros'

export const FII_CATEGORY_LABELS: Record<FiiCategory, string> = {
  papel: 'Papel',
  tijolo: 'Tijolo',
  misto: 'Misto',
  outros: 'Outros',
}

export const FII_CATEGORIES = ['papel', 'tijolo', 'misto', 'outros'] as const

/** Fundamentos de um FII, na unidade em que o domínio raciocina. */
export interface FiiFundamentals {
  ticker: string
  name: string
  category: FiiCategory
  /** Subdivisão da fonte: "Shoppings", "Papéis", "Lajes Corporativas"… */
  segment: string | null
  price: number | null
  /** Dividend yield dos últimos 12 meses, em pontos percentuais (9.09 = 9,09%). */
  dividendYield: number | null
  /** Preço sobre valor patrimonial, como razão (0,88). */
  priceToBook: number | null
  /** Valor patrimonial por cota. */
  bookValuePerShare: number | null
  /** Liquidez média diária em reais. */
  averageDailyLiquidity: number | null
  netWorth: number | null
  shareholders: number | null
  lastDividend: number | null
}

/**
 * Porta para fundamentos de FII.
 *
 * Existe separada de `AssetUniverseProvider` porque a brapi não entrega
 * fundamento nenhum no plano em uso — nem DY, nem VP. Isolar aqui deixa a troca
 * de fonte barata.
 */
export interface FiiFundamentalsProvider {
  /** Todos os FIIs conhecidos pela fonte, numa chamada. */
  list(signal?: AbortSignal): Promise<FiiFundamentals[]>
}

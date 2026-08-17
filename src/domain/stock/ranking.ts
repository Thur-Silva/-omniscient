import type { StockFundamentals } from './fundamentals'
import { calculateSafetyMargin } from '../valuation/models/safety-margin'
import {
  PERPETUAL_GROWTH,
  sustainableGrowth,
  TwoPhaseDcfModel,
} from '../valuation/models/two-phase-dcf'

export const STOCK_CRITERIA = {
  /** Abaixo disso não aparece: não há como entrar nem sair da posição. */
  minDailyLiquidity: 2_000_000,
  /**
   * Folga mínima entre a taxa de desconto e o crescimento da fase explícita.
   *
   * Sem isto o ranking vira lixo: a fonte reporta ROE de 366,8% para EQPA3, o que
   * daria g de 361% e um teto de R$ 3.654 contra um preço de R$ 5,17 — primeiro
   * lugar por dado ruim. O crescimento é truncado em `k − folga`, e o corte fica
   * marcado em `growthCapped` para a tela poder avisar.
   */
  growthGapToDiscount: 0.01,
  /** Faixa aceita para a taxa de desconto escolhida pelo usuário. */
  minDiscountRate: 0.04,
  maxDiscountRate: 0.4,
  /** Passo de arredondamento de k, para o cache não virar chave infinita. */
  discountRateStep: 0.005,
} as const

export type StockRejectionReason =
  | 'sem-premissas'
  | 'sem-lucro'
  | 'sem-preco'
  | 'liquidez-baixa'
  | 'modelo-recusou'

export interface RankedStock {
  fundamentals: StockFundamentals
  /** Preço teto por ação. */
  ceiling: number
  /** Desconto do mercado contra o teto, como fração. Único critério de ordem. */
  safetyMargin: number
  /** Crescimento efetivamente usado, já com o limite aplicado. */
  growthRate: number
  /** Crescimento antes do limite, quando houve corte. */
  uncappedGrowthRate: number | null
  growthCapped: boolean
  /** Referência de tela, não entra na ordenação. */
  priceToEarnings: number | null
  position: number
}

export interface StockRanking {
  ranked: RankedStock[]
  /** Taxa de desconto usada, já normalizada. */
  discountRate: number
  universeSize: number
  rejectedByReason: Record<StockRejectionReason, number>
  /** Quantas ações tiveram o crescimento truncado. */
  cappedCount: number
}

/**
 * Arredonda e limita a taxa de desconto.
 *
 * O ranking é cacheado por valor de k, então k livre viraria chave infinita no
 * banco. Passo de meio ponto percentual dentro de 4% a 40% deixa 73 chaves
 * possíveis, o que é suficiente para escolher e finito para guardar.
 */
export function normalizeDiscountRate(rate: number): number {
  const { minDiscountRate, maxDiscountRate, discountRateStep } = STOCK_CRITERIA
  if (!Number.isFinite(rate)) return 0.2
  const clamped = Math.min(maxDiscountRate, Math.max(minDiscountRate, rate))
  return Number((Math.round(clamped / discountRateStep) * discountRateStep).toFixed(4))
}

function reject(stock: StockFundamentals, discountRate: number): StockRejectionReason | null {
  const { netIncome, payout, returnOnEquity, sharesOutstanding, price } = stock

  if (payout == null || returnOnEquity == null || sharesOutstanding == null || netIncome == null) {
    return 'sem-premissas'
  }
  if (netIncome <= 0) return 'sem-lucro'
  if (price == null || price <= 0) return 'sem-preco'
  if ((stock.averageDailyLiquidity ?? 0) < STOCK_CRITERIA.minDailyLiquidity) {
    return 'liquidez-baixa'
  }
  // A perpetuidade divide por (k − 3%); fora disso o modelo nem calcula.
  if (discountRate <= PERPETUAL_GROWTH) return 'modelo-recusou'
  return null
}

/**
 * Ranqueia ações pela margem de desconto contra o preço teto.
 *
 * Eixo único, diferente do ranking de FIIs: a margem já sai do fluxo de caixa
 * descontado, que embute lucro, payout, ROE e k. Somar P/L a ela pesaria lucro
 * duas vezes e deslocaria a ordem para longe do desconto, que é o que se quer
 * medir. P/L segue no retorno apenas como leitura de tela.
 */
export function rankStocks(
  universe: readonly StockFundamentals[],
  requestedDiscountRate: number,
): StockRanking {
  const discountRate = normalizeDiscountRate(requestedDiscountRate)
  const model = new TwoPhaseDcfModel()

  const rejectedByReason: Record<StockRejectionReason, number> = {
    'sem-premissas': 0,
    'sem-lucro': 0,
    'sem-preco': 0,
    'liquidez-baixa': 0,
    'modelo-recusou': 0,
  }

  const maxGrowth = discountRate - STOCK_CRITERIA.growthGapToDiscount
  const evaluated: Omit<RankedStock, 'position'>[] = []

  for (const stock of universe) {
    const reason = reject(stock, discountRate)
    if (reason != null) {
      rejectedByReason[reason] += 1
      continue
    }

    const raw = sustainableGrowth(stock.returnOnEquity!, stock.payout!)
    const capped = raw > maxGrowth
    const growthRate = capped ? maxGrowth : raw

    // O modelo deriva g de ROE e payout, então para aplicar o limite passa-se um
    // ROE equivalente ao g desejado, mantendo o payout.
    const retention = 1 - stock.payout!
    const effectiveRoe = retention > 0 ? growthRate / retention : 0

    try {
      const breakdown = model.project({
        netIncome: stock.netIncome!,
        payout: stock.payout!,
        returnOnEquity: effectiveRoe,
        discountRate,
        sharesOutstanding: stock.sharesOutstanding!,
      })

      evaluated.push({
        fundamentals: stock,
        ceiling: breakdown.fairValue,
        safetyMargin: calculateSafetyMargin(breakdown.fairValue, stock.price!),
        growthRate: breakdown.growthRate,
        uncappedGrowthRate: capped ? raw : null,
        growthCapped: capped,
        priceToEarnings: stock.priceToEarnings ?? null,
      })
    } catch {
      rejectedByReason['modelo-recusou'] += 1
    }
  }

  // Maior desconto primeiro. Empate cai para o ticker, só para a ordem ser estável
  // entre duas apurações do mesmo minuto.
  const ranked = [...evaluated]
    .sort(
      (a, b) =>
        b.safetyMargin - a.safetyMargin ||
        a.fundamentals.ticker.localeCompare(b.fundamentals.ticker),
    )
    .map((entry, index) => ({ ...entry, position: index + 1 }))

  return {
    ranked,
    discountRate,
    universeSize: universe.length,
    rejectedByReason,
    cappedCount: ranked.filter((entry) => entry.growthCapped).length,
  }
}

import {
  missingForCeiling,
  type StockFundamentals,
  type StockFundamentalsProvider,
} from '../../domain/stock/fundamentals'
import {
  EXPLICIT_YEARS,
  PERPETUAL_GROWTH,
  sustainableGrowth,
  TwoPhaseDcfModel,
  type TwoPhaseDcfBreakdown,
} from '../../domain/valuation/models/two-phase-dcf'
import { calculateSafetyMargin } from '../../domain/valuation/models/safety-margin'

/**
 * Taxa de desconto inicial. É a premissa do documento do BBAS3 e não vem de API
 * nenhuma: retorno exigido é escolha do investidor.
 */
export const DEFAULT_DISCOUNT_RATE = 0.2

/** Os campos que a tela deixa o usuário editar. */
export interface CeilingAssumptions {
  netIncome: number | null
  payout: number | null
  returnOnEquity: number | null
  discountRate: number | null
  sharesOutstanding: number | null
  /**
   * g pedido para cada ano da fase explícita. `null` deixa o modelo derivar de
   * ROE × (1 − payout). É a sobrescrita do usuário sobre o valor inflado.
   */
  growthRates: (number | null)[]
  /** g pedido para a perpetuidade. O modelo limita em 3%. */
  perpetualGrowth: number | null
}

export interface PrefilledCeiling {
  fundamentals: StockFundamentals
  /** Já preenchido com o que a fonte trouxe. */
  assumptions: CeilingAssumptions
  /** Rótulos do que a fonte não trouxe e precisa ser digitado. */
  missing: string[]
}

export interface CeilingResult {
  breakdown: TwoPhaseDcfBreakdown
  /** Preço teto por ação. */
  ceiling: number
  /** Fração de desconto contra o preço de mercado, quando há preço. */
  safetyMargin: number | null
  marketPrice: number | null
}

/**
 * Preço teto de uma ação pelo fluxo de caixa descontado em duas fases.
 *
 * O trabalho aqui é preencher as premissas com o que a fonte sabe, para o usuário
 * só corrigir o que estiver defasado. O cálculo em si é do domínio.
 */
export class EstimatePriceCeiling {
  private readonly stocks: StockFundamentalsProvider
  private readonly model: TwoPhaseDcfModel

  constructor(stocks: StockFundamentalsProvider) {
    this.stocks = stocks
    this.model = new TwoPhaseDcfModel()
  }

  /** Ações que casam com o termo, por ticker ou nome. */
  async search(term: string, limit = 12, signal?: AbortSignal): Promise<StockFundamentals[]> {
    const needle = term.trim().toUpperCase()
    if (needle.length < 2) return []

    const all = await this.stocks.list(signal)
    const matches = all.filter(
      (stock) =>
        stock.ticker.includes(needle) || stock.name.toUpperCase().includes(needle),
    )
    // Ticker exato primeiro, depois quem começa com o termo: digitar "BBAS"
    // deve trazer BBAS3 antes de uma empresa com "bbas" no meio do nome.
    return matches
      .sort((a, b) => rankMatch(a, needle) - rankMatch(b, needle))
      .slice(0, limit)
  }

  async prefill(ticker: string, signal?: AbortSignal): Promise<PrefilledCeiling | null> {
    const fundamentals = await this.stocks.find(ticker, signal)
    if (fundamentals == null) return null

    // g derivado de ROE e payout: é o valor "inflado" que a tela mostra por ano
    // e deixa o usuário corrigir. Sem ROE ou payout, o campo vem vazio e o
    // modelo deriva o mesmo caminho — a diferença é só de exibição.
    const derivedGrowth =
      fundamentals.payout != null && fundamentals.returnOnEquity != null
        ? sustainableGrowth(fundamentals.returnOnEquity, fundamentals.payout)
        : null

    return {
      fundamentals,
      assumptions: {
        netIncome: fundamentals.netIncome,
        payout: fundamentals.payout,
        returnOnEquity: fundamentals.returnOnEquity,
        // Único campo sem origem em dado: começa no padrão documentado.
        discountRate: DEFAULT_DISCOUNT_RATE,
        sharesOutstanding: fundamentals.sharesOutstanding,
        growthRates: Array.from({ length: EXPLICIT_YEARS }, () => derivedGrowth),
        perpetualGrowth: PERPETUAL_GROWTH,
      },
      missing: missingForCeiling(fundamentals),
    }
  }

  /**
   * Calcula o teto. Devolve `null` enquanto faltar premissa, em vez de assumir
   * valor no lugar do usuário.
   */
  compute(assumptions: CeilingAssumptions, marketPrice: number | null): CeilingResult | null {
    const { netIncome, payout, returnOnEquity, discountRate, sharesOutstanding } = assumptions
    if (
      netIncome == null ||
      payout == null ||
      returnOnEquity == null ||
      discountRate == null ||
      sharesOutstanding == null
    ) {
      return null
    }

    const breakdown = this.model.project({
      netIncome,
      payout,
      returnOnEquity,
      discountRate,
      sharesOutstanding,
      growthRates: assumptions.growthRates,
      perpetualGrowth: assumptions.perpetualGrowth,
    })

    return {
      breakdown,
      ceiling: breakdown.fairValue,
      safetyMargin:
        marketPrice != null && marketPrice > 0
          ? calculateSafetyMargin(breakdown.fairValue, marketPrice)
          : null,
      marketPrice,
    }
  }
}

function rankMatch(stock: StockFundamentals, needle: string): number {
  if (stock.ticker === needle) return 0
  if (stock.ticker.startsWith(needle)) return 1
  if (stock.name.toUpperCase().startsWith(needle)) return 2
  return 3
}

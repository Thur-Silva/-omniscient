import { ValuationError } from '../errors/valuation-error'
import type { CeilingMethodId, MethodInput } from '../valuation/methods'
import { CEILING_METHODS } from '../valuation/methods'
import {
  BazinModel,
  MAX_TRAILING_DIVIDEND_YIELD,
  type BazinBreakdown,
} from '../valuation/models/bazin'
import {
  GrahamNumberModel,
  type GrahamNumberBreakdown,
} from '../valuation/models/graham-number'
import {
  ResidualIncomeModel,
  type ResidualIncomeBreakdown,
} from '../valuation/models/residual-income'
import {
  sustainableGrowth,
  TwoPhaseDcfModel,
  type TwoPhaseDcfBreakdown,
} from '../valuation/models/two-phase-dcf'
import {
  TwoPhaseDdmModel,
  type TwoPhaseDdmBreakdown,
} from '../valuation/models/two-phase-ddm'
import type { StockFundamentals } from './fundamentals'

/**
 * Aplicação dos métodos de preço teto sobre os fundamentos de uma ação.
 *
 * Aqui mora o que é comum a todos os métodos — de onde vem cada premissa, como o
 * crescimento é limitado, o que fazer quando falta dado — para que a escolha de
 * método na tela e no ranking seja a mesma conta.
 */

export interface CeilingParams {
  /** Retorno exigido, como fração. Usado por FCD, DDM e renda residual. */
  discountRate: number
  /** Yield exigido do Bazin, como fração. */
  requiredYield: number
  /**
   * Teto do crescimento explícito, como fração. Existe porque a fonte reporta
   * ROE absurdo em alguns papéis (366,8% em EQPA3), e um g de 361% coloca lixo
   * no topo do ranking. `null` desliga o limite.
   */
  maxGrowth?: number | null
  /**
   * DPA a usar em Bazin e DDM, em reais. Omitido, usa o dividendo de 12 meses
   * derivado de DY × preço. É por aqui que entra a média de 5 anos do método
   * original, quando o histórico está disponível.
   */
  dividendPerShare?: number | null
}

export type CeilingBreakdown =
  | { method: 'fcd-2-fases'; dcf: TwoPhaseDcfBreakdown }
  | { method: 'ddm-gordon'; ddm: TwoPhaseDdmBreakdown }
  | { method: 'bazin'; bazin: BazinBreakdown }
  | { method: 'renda-residual'; residual: ResidualIncomeBreakdown }
  | { method: 'numero-graham'; graham: GrahamNumberBreakdown }

export interface MethodCeiling {
  method: CeilingMethodId
  /** Preço teto por ação. */
  ceiling: number
  breakdown: CeilingBreakdown
  /** g aplicado, quando o método usa crescimento; null quando não usa. */
  growthRate: number | null
  /** g antes do limite, quando houve corte. */
  uncappedGrowthRate: number | null
  growthCapped: boolean
}

const dcfModel = new TwoPhaseDcfModel()
const ddmModel = new TwoPhaseDdmModel()
const bazinModel = new BazinModel()
const residualModel = new ResidualIncomeModel()
const grahamModel = new GrahamNumberModel()

/** Valor de cada premissa para este ativo, já resolvendo as sobrescritas. */
function inputValue(
  input: MethodInput,
  stock: StockFundamentals,
  params: CeilingParams,
): number | null {
  switch (input) {
    case 'netIncome':
      return stock.netIncome
    case 'payout':
      return stock.payout
    case 'returnOnEquity':
      return stock.returnOnEquity
    case 'sharesOutstanding':
      return stock.sharesOutstanding
    case 'earningsPerShare':
      return stock.earningsPerShare
    case 'bookValuePerShare':
      return stock.bookValuePerShare
    case 'dividendPerShare':
      return params.dividendPerShare ?? stock.dividendPerShare
    case 'discountRate':
      return params.discountRate
    case 'requiredYield':
      return params.requiredYield
  }
}

/** Premissas que faltam para o método rodar. Vazio significa que dá para calcular. */
export function missingInputs(
  method: CeilingMethodId,
  stock: StockFundamentals,
  params: CeilingParams,
): MethodInput[] {
  return CEILING_METHODS[method].inputs.filter((input) => {
    const value = inputValue(input, stock, params)
    return value == null || !Number.isFinite(value)
  })
}

/**
 * Payout para efeito de crescimento, limitado a 100%.
 *
 * Distribuir mais que o lucro é comum e legítimo — reserva acumulada, venda de
 * ativo, ciclo de investimento baixo —, mas retenção negativa não faz o lucro
 * encolher no ritmo da diferença, e os modelos rejeitariam a premissa. Limitar em
 * 100% diz o que economicamente acontece: sem retenção, não há crescimento por
 * reinvestimento, então g = 0.
 */
function payoutForGrowth(payout: number): number {
  return Math.min(1, Math.max(0, payout))
}

/** Crescimento a aplicar, já com o limite de `maxGrowth`. */
function resolveGrowth(
  stock: StockFundamentals,
  params: CeilingParams,
): { growthRate: number | null; uncapped: number | null; capped: boolean } {
  if (stock.returnOnEquity == null || stock.payout == null) {
    return { growthRate: null, uncapped: null, capped: false }
  }
  const derived = sustainableGrowth(stock.returnOnEquity, payoutForGrowth(stock.payout))
  const limit = params.maxGrowth
  if (limit != null && derived > limit) {
    return { growthRate: limit, uncapped: derived, capped: true }
  }
  return { growthRate: derived, uncapped: null, capped: false }
}

/**
 * Calcula o teto pelo método pedido. Lança `ValuationError` quando falta premissa
 * ou quando o próprio modelo recusa — nada é estimado no lugar do dado ausente.
 */
export function computeCeiling(
  method: CeilingMethodId,
  stock: StockFundamentals,
  params: CeilingParams,
): MethodCeiling {
  const missing = missingInputs(method, stock, params)
  if (missing.length > 0) {
    throw new ValuationError(
      `Faltam premissas para ${CEILING_METHODS[method].label}: ${missing.join(', ')}.`,
    )
  }

  const { growthRate, uncapped, capped } = resolveGrowth(stock, params)
  const base = { growthRate, uncappedGrowthRate: uncapped, growthCapped: capped }
  // Os modelos exigem payout entre 0 e 100%; acima disso não há retenção a modelar.
  const payout = stock.payout == null ? null : payoutForGrowth(stock.payout)

  /**
   * Métodos de dividendo só aceitam base recorrente. O DPA derivado de DY × preço
   * carrega o extraordinário do período, e é aqui — não no modelo — que ele é
   * barrado, porque a regra é sobre a qualidade do dado da fonte. DPA informado
   * pelo chamador (média de 5 anos, ou digitado na tela) passa direto.
   */
  if (method === 'ddm-gordon' || method === 'bazin') {
    const fromSource = params.dividendPerShare == null
    const trailingYield =
      fromSource && stock.price != null && stock.price > 0 && stock.dividendPerShare != null
        ? stock.dividendPerShare / stock.price
        : null
    if (trailingYield != null && trailingYield > MAX_TRAILING_DIVIDEND_YIELD) {
      throw new ValuationError(
        `O dividendo dos últimos 12 meses rende ${(trailingYield * 100).toFixed(1)}% sobre o preço, acima do limite de ${(MAX_TRAILING_DIVIDEND_YIELD * 100).toFixed(0)}%: é distribuição extraordinária ou dado defasado, e não serve de base recorrente.`,
      )
    }
  }

  switch (method) {
    case 'fcd-2-fases': {
      /**
       * O limite de g entra como ROE equivalente, não como sobrescrita de ano: o
       * modelo deriva a trava de retenção de `g/ROE`, e manter o ROE absurdo com
       * g truncado devolveria retenção quase nula — ou seja, distribuir quase
       * todo o lucro. Passar `ROE = g/(1 − payout)` mantém a retenção coerente
       * com o payout observado.
       */
      const retention = 1 - payout!
      const effectiveRoe =
        capped && retention > 0 ? growthRate! / retention : stock.returnOnEquity!
      const dcf = dcfModel.project({
        netIncome: stock.netIncome!,
        payout: payout!,
        returnOnEquity: effectiveRoe,
        discountRate: params.discountRate,
        sharesOutstanding: stock.sharesOutstanding!,
      })
      return { method, ceiling: dcf.fairValue, breakdown: { method, dcf }, ...base }
    }
    case 'ddm-gordon': {
      const ddm = ddmModel.project({
        dividendPerShare: params.dividendPerShare ?? stock.dividendPerShare!,
        payout: payout!,
        returnOnEquity: stock.returnOnEquity!,
        discountRate: params.discountRate,
        growthRate,
      })
      return { method, ceiling: ddm.fairValue, breakdown: { method, ddm }, ...base }
    }
    case 'bazin': {
      const bazin = bazinModel.project(
        {
          dividendPerShare: params.dividendPerShare ?? stock.dividendPerShare!,
          requiredYield: params.requiredYield,
        },
        stock.price,
      )
      // Bazin não usa crescimento: reportar g aqui sugeriria influência que não existe.
      return {
        method,
        ceiling: bazin.fairValue,
        breakdown: { method, bazin },
        growthRate: null,
        uncappedGrowthRate: null,
        growthCapped: false,
      }
    }
    case 'renda-residual': {
      const residual = residualModel.project({
        bookValuePerShare: stock.bookValuePerShare!,
        returnOnEquity: stock.returnOnEquity!,
        discountRate: params.discountRate,
        payout: payout!,
        growthRate,
      })
      // O g reportado é o que o modelo aplicou, não o que entrou: a renda
      // residual é fórmula de perpetuidade e limita o crescimento em 3%. Mostrar
      // o g de entrada aqui faria a tela contar uma conta que não foi feita.
      return {
        method,
        ceiling: residual.fairValue,
        breakdown: { method, residual },
        growthRate: residual.growthRate,
        uncappedGrowthRate: residual.growthCapped
          ? residual.requestedGrowthRate
          : base.uncappedGrowthRate,
        growthCapped: residual.growthCapped || base.growthCapped,
      }
    }
    case 'numero-graham': {
      const graham = grahamModel.project({
        earningsPerShare: stock.earningsPerShare!,
        bookValuePerShare: stock.bookValuePerShare!,
      })
      return {
        method,
        ceiling: graham.fairValue,
        breakdown: { method, graham },
        growthRate: null,
        uncappedGrowthRate: null,
        growthCapped: false,
      }
    }
  }
}

export interface ResolvedCeiling extends MethodCeiling {
  /** Método pedido originalmente, quando houve degradação. */
  requestedMethod: CeilingMethodId
  /** `true` quando o pedido não pôde rodar e a cadeia degradou. */
  fellBack: boolean
  /** Motivo da degradação, para a tela dizer o que aconteceu. */
  fallbackReason: string | null
}

/**
 * Roda o primeiro método viável da cadeia.
 *
 * Degradar é melhor que omitir o ativo: metade do universo não tem DY na fonte, e
 * uma pagadora sem dividendo publicado ainda pode ser avaliada pelo fluxo. O
 * resultado carrega o método pedido e o motivo, então a tela nunca mente sobre
 * qual régua produziu o número.
 */
export function resolveCeiling(
  chain: readonly CeilingMethodId[],
  stock: StockFundamentals,
  params: CeilingParams,
): ResolvedCeiling | null {
  const requestedMethod = chain[0]
  let firstFailure: string | null = null

  for (const method of chain) {
    try {
      const computed = computeCeiling(method, stock, params)
      if (!Number.isFinite(computed.ceiling) || computed.ceiling <= 0) {
        firstFailure = firstFailure ?? `${CEILING_METHODS[method].label} devolveu teto inválido`
        continue
      }
      return {
        ...computed,
        requestedMethod,
        fellBack: method !== requestedMethod,
        fallbackReason: method !== requestedMethod ? firstFailure : null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'premissa inválida'
      firstFailure = firstFailure ?? message
    }
  }

  return null
}

import type { StockFundamentals } from '../../domain/stock/fundamentals'
import type { StatusInvestStockItem } from './types'

/**
 * Consulta e mapeamento das ações, sem nenhuma dependência de browser.
 *
 * Fica separado do provedor porque o servidor também precisa disto para montar o
 * ranking, e o provedor carrega o `HttpClient`, que lê `import.meta.env`.
 * Importar o mapeamento no Node não deve arrastar código de cliente.
 */

/** CategoryType 1 é o de ação na busca avançada. */
export const STOCK_CATEGORY = 1

/** Filtros vazios: queremos o universo inteiro e decidimos no domínio. */
const EMPTY_SEARCH = JSON.stringify({
  Sector: '',
  SubSector: '',
  Segment: '',
  my_range: '-20;100',
  forecast: {
    upsidedownside: { Item1: null, Item2: null },
    estimatesnumber: { Item1: null, Item2: null },
    revisedup: true,
    reviseddown: true,
    consensus: [],
  },
  dy: { Item1: null, Item2: null },
  p_l: { Item1: null, Item2: null },
  roe: { Item1: null, Item2: null },
})

export const STOCK_PATH = '/category/advancedsearchresultpaginated'

/**
 * Parâmetros da consulta.
 *
 * Cliente e servidor usam este mesmo objeto para que a chave de cache seja
 * idêntica nos dois caminhos e uma só ida ao StatusInvest sirva aos dois.
 */
export const STOCK_QUERY: Record<string, string | number> = {
  search: EMPTY_SEARCH,
  orderColumn: '',
  isAsc: '',
  page: 0,
  take: 1000,
  CategoryType: STOCK_CATEGORY,
}

function toNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Positivo ou nulo: zero em campo de fundamento significa ausência de dado. */
function toPositive(value: number | null | undefined): number | null {
  const parsed = toNumber(value)
  return parsed != null && parsed > 0 ? parsed : null
}

export function toStockFundamentals(item: StatusInvestStockItem): StockFundamentals {
  const price = toPositive(item.price)
  const marketCap = toPositive(item.valormercado)
  const eps = toNumber(item.lpa)
  const dividendYield = toNumber(item.dy)

  /**
   * A fonte não devolve o número de ações, mas devolve preço e capitalização, e
   * capitalização é preço × ações. Conferido contra o documento do BBAS3: a
   * divisão dá 5.730.834.040, exatamente as ações que ele declara.
   */
  const sharesOutstanding = price != null && marketCap != null ? marketCap / price : null

  /** Lucro líquido reconstruído a partir do lucro por ação. */
  const netIncome =
    eps != null && eps > 0 && sharesOutstanding != null ? eps * sharesOutstanding : null

  /**
   * Payout também é derivado: o dividendo por ação é o yield aplicado ao preço, e
   * a fração distribuída é esse dividendo sobre o lucro por ação. Fica nulo
   * quando a fonte não traz o yield, o que acontece em boa parte das ações.
   */
  const payout =
    dividendYield != null && dividendYield > 0 && price != null && eps != null && eps > 0
      ? ((dividendYield / 100) * price) / eps
      : null

  const roe = toNumber(item.roe)
  const revenueCagr5 = toNumber(item.receitas_cagr5)

  /**
   * EBIT reconstruído: P/EBIT é preço sobre EBIT por ação, então capitalização
   * dividida por P/EBIT devolve o EBIT da empresa. Conferido no PETR4 em
   * 19/08/2026: R$ 585,8 bi / 2,96 = R$ 197,9 bi de resultado operacional.
   */
  const priceToEbit = toPositive(item.p_ebit)
  const ebit = marketCap != null && priceToEbit != null ? marketCap / priceToEbit : null

  /** Valor da firma pelo múltiplo que a fonte publica sobre o mesmo EBIT. */
  const evToEbit = toPositive(item.ev_ebit)
  const enterpriseValue = ebit != null && evToEbit != null ? ebit * evToEbit : null

  const netDebtToEquity = toNumber(item.dividaliquidapatrimonioliquido)
  const bookValuePerShare = toNumber(item.vpa)

  /**
   * Dívida líquida, por dois caminhos, na ordem de preferência:
   *
   * 1. `EV − capitalização`, quando a fonte traz os dois múltiplos. É a medida de
   *    mercado, coerente com os pesos do WACC.
   * 2. `D/PL × patrimônio contábil`, quando falta múltiplo. É contábil, e por isso
   *    fica em segundo: no PETR4 os dois caminhos dão R$ 372 bi e R$ 331 bi — a
   *    diferença é minoritário e critério de consolidação, não erro de conta.
   */
  const bookEquity =
    bookValuePerShare != null && sharesOutstanding != null
      ? bookValuePerShare * sharesOutstanding
      : null
  const netDebt =
    enterpriseValue != null && marketCap != null
      ? enterpriseValue - marketCap
      : netDebtToEquity != null && bookEquity != null
        ? netDebtToEquity * bookEquity
        : null

  const roic = toNumber(item.roic)

  /** Dividendo por ação dos 12 meses: o yield aplicado ao preço. */
  const dividendPerShare =
    dividendYield != null && dividendYield > 0 && price != null
      ? (dividendYield / 100) * price
      : null

  return {
    ticker: item.ticker.trim().toUpperCase(),
    name: item.companyname?.trim() ?? item.ticker,
    sector: item.segmentname?.trim() || item.sectorname?.trim() || null,
    sectorName: item.sectorname?.trim() || null,
    subsectorName: item.subsectorname?.trim() || null,
    segmentName: item.segmentname?.trim() || null,
    price,
    netIncome,
    earningsPerShare: eps,
    payout,
    // Chega em pontos percentuais; o domínio raciocina em fração.
    returnOnEquity: roe != null ? roe / 100 : null,
    sharesOutstanding,
    bookValuePerShare,
    priceToEarnings: toNumber(item.p_l),
    averageDailyLiquidity: toNumber(item.liquidezmediadiaria),
    dividendYield: dividendYield != null ? dividendYield / 100 : null,
    dividendPerShare,
    // CAGR de receita também chega em pontos percentuais.
    revenueCagr5: revenueCagr5 != null ? revenueCagr5 / 100 : null,
    marketCap,
    ebit,
    enterpriseValue,
    netDebt,
    netDebtToEquity,
    netDebtToEbit: toNumber(item.dividaliquidaebit),
    // ROIC também chega em pontos percentuais.
    returnOnInvestedCapital: roic != null ? roic / 100 : null,
  }
}

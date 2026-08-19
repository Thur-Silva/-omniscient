/**
 * Resposta de GET /category/advancedsearchresultpaginated?CategoryType=2
 * Confirmada contra o serviço em 14/08/2026: 603 FIIs numa única chamada.
 *
 * Não é API pública documentada — é o endpoint que a busca avançada do site
 * consome. Os nomes de campo vêm de lá, em português e snake_case.
 */
export interface StatusInvestFiiItem {
  ticker: string
  companyname: string | null
  price: number | null
  /** Em pontos percentuais: 9.0922 significa 9,09%. */
  dy: number | null
  /** Razão: 0.8761. */
  p_vp: number | null
  valorpatrimonialcota: number | null
  /** Em reais, média diária. */
  liquidezmediadiaria: number | null
  patrimonio: number | null
  numerocotistas: number | null
  numerocotas: number | null
  lastdividend: number | null
  segment: string | null
  segmentid: number | null
  sectorname: string | null
  subsectorname: string | null
  percentualcaixa: number | null
  dividend_cagr: number | null
  cota_cagr: number | null
}

export interface StatusInvestFiiResponse {
  list: StatusInvestFiiItem[]
  totalResults?: number
  hasForecast?: boolean
}

/**
 * Item de CategoryType=1 (ações). Confirmado contra o serviço em 14/08/2026:
 * 617 ações numa chamada.
 *
 * Não traz lucro líquido, payout nem número de ações diretamente — os três são
 * derivados no provedor a partir de `lpa`, `dy`, `price` e `valormercado`.
 */
export interface StatusInvestStockItem {
  ticker: string
  companyname: string | null
  price: number | null
  /** Lucro por ação dos últimos 12 meses. */
  lpa: number | null
  /** Valor patrimonial por ação. */
  vpa: number | null
  /** Dividend yield em pontos percentuais: 3 significa 3%. */
  dy: number | null
  /** Retorno sobre patrimônio em pontos percentuais: 8.27 significa 8,27%. */
  roe: number | null
  p_l: number | null
  p_vp: number | null
  /** Capitalização de mercado em reais. */
  valormercado: number | null
  liquidezmediadiaria: number | null
  sectorname: string | null
  subsectorname: string | null
  segmentname: string | null
  /** CAGR de receita em 5 anos, em pontos percentuais. */
  receitas_cagr5: number | null
  /** Preço sobre EBIT por ação. Reconstrói o EBIT a partir da capitalização. */
  p_ebit: number | null
  /** Valor da firma sobre EBIT. Com o EBIT, dá o valor da firma. */
  ev_ebit: number | null
  /** Dívida líquida sobre patrimônio líquido, como razão: 0.65. */
  dividaliquidapatrimonioliquido: number | null
  /** Dívida líquida sobre EBIT, como razão: 1.68. */
  dividaliquidaebit: number | null
  /** Retorno sobre capital investido em pontos percentuais: 11.11 é 11,11%. */
  roic: number | null
}

export interface StatusInvestStockResponse {
  list: StatusInvestStockItem[]
  totalResults?: number
}

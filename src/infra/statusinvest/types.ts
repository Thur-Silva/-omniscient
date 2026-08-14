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

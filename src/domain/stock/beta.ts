import { CORPORATE_TAX_RATE } from '../valuation/cost-of-capital'
import type { StockFundamentals } from './fundamentals'
import { structuralFamily } from './method-selection'

/**
 * Beta por natureza do negócio, relavancado pela estrutura de capital da empresa.
 *
 * O beta de regressão — inclinação do papel contra o Ibovespa — é o caminho de
 * livro, e é ruim onde precisamos dele: exige série de preços por ticker (uma
 * requisição por ativo, 617 ativos), tem erro-padrão grande em papel de baixa
 * liquidez e mede o passado de uma estrutura de capital que pode ter mudado. Para
 * um ranking de mercado inteiro ele não serve.
 *
 * O caminho aqui é o *bottom-up beta* de Damodaran: o risco de um negócio é o do
 * setor em que ele opera, e o que difere uma empresa da média do setor é a
 * alavancagem. Então parte-se do beta desalavancado do setor e devolve-se a
 * alavancagem da empresa:
 *
 *     β_alavancado = β_desalavancado × [1 + (1 − t) × D/E]
 *
 * O `(1 − t)` está ali porque a dívida traz benefício fiscal: o risco que a
 * alavancagem adiciona ao acionista é líquido do imposto que ela poupa. A conta é
 * a de Hamada (1972).
 *
 * Duas consequências que a tela precisa dizer: o beta daqui é premissa de setor,
 * não medição do papel; e empresa mais endividada recebe beta maior, logo Ke maior
 * e teto menor — o que é o efeito econômico correto, e o que uma taxa única para
 * todo o mercado apagava.
 *
 * Instituição financeira é exceção: alavancagem é o insumo do negócio, e
 * relavancar um banco por dívida líquida devolveria beta sem sentido. Para
 * financeiro a tabela já traz o beta alavancado do setor, e a conta de Hamada não
 * roda.
 */

/** Segmento B3 (`segmentName`) → beta desalavancado. Vence os níveis acima. */
const SEGMENT_BETA: Record<string, number> = {
  'Exploração de Rodovias': 0.7,
  'Transporte Ferroviário': 0.7,
  'Água e Saneamento': 0.4,
  'Energia Elétrica': 0.4,
  Gás: 0.45,
  Telecomunicações: 0.65,
  'Exploração. Refino e Distribuição': 0.8,
  Seguradoras: 0.85,
  Bancos: 1.0,
}

/** Subsetor B3 (`subsectorName`) → beta desalavancado. */
const SUBSECTOR_BETA: Record<string, number> = {
  // Financeiro: já alavancado, ver `LEVERED_BY_NATURE`.
  'Intermediários Financeiros': 1.0,
  'Previdência e Seguros': 0.85,
  'Serviços Financeiros Diversos': 0.95,
  'Holdings Diversificadas': 0.95,
  'Exploração de Imóveis': 0.85,
  // Concessão e utilidade pública: demanda inelástica, tarifa regulada.
  'Água e Saneamento': 0.4,
  'Energia Elétrica': 0.4,
  Gás: 0.45,
  Telecomunicações: 0.65,
  // Cíclicas: resultado atrelado a preço de commodity e a ciclo de crédito.
  Mineração: 0.95,
  'Siderurgia e Metalurgia': 1.0,
  'Madeira e Papel': 0.85,
  Químicos: 0.9,
  Embalagens: 0.75,
  Agropecuária: 0.75,
  'Alimentos Processados': 0.65,
  Bebidas: 0.6,
  'Construção Civil': 1.05,
  'Construção e Engenharia': 1.05,
  'Automóveis e Motocicletas': 1.0,
  'Material de Transporte': 0.95,
  // Consumo, saúde, tecnologia e bens industriais.
  'Comércio e Distribuição': 0.9,
  Comércio: 0.95,
  'Tecidos. Vestuário e Calçados': 0.95,
  'Utilidades Domésticas': 0.85,
  'Serviços Médico-Hospitalares. Análises e Diagnósticos': 0.75,
  'Medicamentos e Outros Produtos': 0.75,
  'Máquinas e Equipamentos': 0.95,
  'Programas e Serviços': 1.1,
  'Computadores e Equipamentos': 1.1,
  'Serviços Diversos': 0.9,
  'Transporte': 0.8,
  'Viagens e Lazer': 1.05,
  'Hoteis e Restaurantes': 1.05,
  'Diversos': 0.9,
}

/** Setor B3 (`sectorName`) → beta desalavancado. Último nível antes do padrão. */
const SECTOR_BETA: Record<string, number> = {
  'Utilidade Pública': 0.4,
  Comunicações: 0.65,
  'Materiais Básicos': 0.95,
  'Petróleo. Gás e Biocombustíveis': 0.8,
  'Financeiro e Outros': 1.0,
  'Consumo não Cíclico': 0.65,
  'Consumo Cíclico': 0.95,
  Saúde: 0.75,
  'Tecnologia da Informação': 1.1,
  'Bens Industriais': 0.95,
}

/**
 * Beta de quem não tem setor reconhecido: um pouco abaixo da média de mercado, na
 * faixa em que a maior parte da bolsa cai depois de desalavancada.
 */
export const DEFAULT_UNLEVERED_BETA = 0.9

/**
 * Teto de D/E para relavancar.
 *
 * A fonte reporta dívida líquida sobre patrimônio acima de 10 em empresa com
 * patrimônio quase zerado, e ali a conta de Hamada devolveria beta de 8 e Ke de
 * 70%. Onde a alavancagem é essa, o problema é solvência, não custo de capital —
 * limitar em 3 mantém o beta numa faixa que ainda é custo de capital.
 */
export const MAX_DEBT_TO_EQUITY = 3

export interface BetaEstimate {
  /** Beta do negócio, sem a estrutura de capital da empresa. */
  unlevered: number
  /** D/E usado para relavancar, já limitado. `null` quando não se relavanca. */
  debtToEquity: number | null
  taxRate: number
  /** Beta aplicado no CAPM. */
  beta: number
  /** `false` para financeiro, onde a tabela já traz o beta alavancado. */
  relevered: boolean
  /** Nível da taxonomia que decidiu o beta, para a tela citar a origem. */
  source: string
}

/** Famílias em que alavancagem é o negócio, não a estrutura de financiamento. */
const LEVERED_BY_NATURE = new Set(['financeiro'])

function unleveredBeta(stock: StockFundamentals): { beta: number; source: string } {
  const segment = stock.segmentName?.trim()
  if (segment && SEGMENT_BETA[segment] != null) {
    return { beta: SEGMENT_BETA[segment], source: segment }
  }
  const subsector = stock.subsectorName?.trim()
  if (subsector && SUBSECTOR_BETA[subsector] != null) {
    return { beta: SUBSECTOR_BETA[subsector], source: subsector }
  }
  const sector = stock.sectorName?.trim()
  if (sector && SECTOR_BETA[sector] != null) {
    return { beta: SECTOR_BETA[sector], source: sector }
  }
  return { beta: DEFAULT_UNLEVERED_BETA, source: 'sem setor na fonte' }
}

/**
 * Beta do ativo: o do setor, relavancado pela dívida líquida sobre patrimônio.
 *
 * Caixa líquido (dívida negativa) entra como zero em vez de reduzir o beta abaixo
 * do setor. Reduzir seria defensável num beta ajustado por caixa, mas aqui
 * baixaria o Ke e subiria o teto por a empresa ter caixa — o caixa já aparece no
 * valor, e contá-lo duas vezes é o defeito que se quer evitar.
 */
export function resolveBeta(
  stock: StockFundamentals,
  options: { taxRate?: number; override?: number | null } = {},
): BetaEstimate {
  const taxRate = options.taxRate ?? CORPORATE_TAX_RATE
  const { beta: unlevered, source } = unleveredBeta(stock)

  if (options.override != null && Number.isFinite(options.override) && options.override > 0) {
    return {
      unlevered,
      debtToEquity: null,
      taxRate,
      beta: options.override,
      relevered: false,
      source: 'informado na tela',
    }
  }

  if (LEVERED_BY_NATURE.has(structuralFamily(stock).family)) {
    return {
      unlevered,
      debtToEquity: null,
      taxRate,
      beta: unlevered,
      relevered: false,
      source,
    }
  }

  const reported = stock.netDebtToEquity
  const debtToEquity =
    reported != null && Number.isFinite(reported)
      ? Math.min(MAX_DEBT_TO_EQUITY, Math.max(0, reported))
      : 0

  return {
    unlevered,
    debtToEquity,
    taxRate,
    beta: unlevered * (1 + (1 - taxRate) * debtToEquity),
    relevered: true,
    source,
  }
}

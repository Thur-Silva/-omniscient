import type { CeilingMethodId, MethodFamily } from '../valuation/methods'
import { FAMILY_PREFERENCE } from '../valuation/methods'
import type { StockFundamentals } from './fundamentals'

/**
 * Escolha da metodologia de preço teto por natureza do ativo.
 *
 * A regra de fundo é uma só: descontar o fluxo que de fato chega ao acionista, e
 * usar a base mais estável que aquele negócio tem. Ela leva a respostas
 * diferentes por setor, e é por isso que uma fórmula única erra sistematicamente
 * em parte do mercado.
 *
 *  · Instituição financeira (banco, seguradora, holding). Para banco a dívida é
 *    insumo, não financiamento: FCFF, EBITDA e capital de giro não se definem, e
 *    a literatura de valuation trata o setor em capítulo separado exatamente por
 *    isso. Sobram modelos de equity; o mais estável é a renda residual sobre o
 *    patrimônio, `VPA × (ROE − g)/(k − g)`.
 *
 *  · Concessão e utilidade pública (energia, saneamento, gás, telecom, rodovia).
 *    Receita regulada por tarifa, crescimento real baixo e payout alto. O caso
 *    canônico do desconto de dividendos: o que o acionista recebe é o dividendo,
 *    e projetar lucro retido superestima um caixa que não sai da empresa.
 *
 *  · Cíclica de commodity (mineração, siderurgia, papel, petróleo, químicos,
 *    agro, proteína) e incorporação. O lucro reverte à média e é lumpy; projetar
 *    os últimos 12 meses por três anos multiplica um resultado de pico ou de
 *    fundo de ciclo. O número de Graham amortece pelo patrimônio — teto de
 *    triagem, e rotulado como tal.
 *
 *  · Crescimento (o resto: consumo, saúde, tecnologia, bens industriais). O valor
 *    está na trajetória do resultado, então o fluxo distribuível projetado é a
 *    régua, com a trava de retenção limitando o que pode sair da empresa.
 *
 * Entre crescimento e pagadora, os dados corrigem a etiqueta do setor: uma
 * indústria madura que distribui 80% do lucro comporta-se como pagadora, e uma
 * concessionária que retém caixa para investir comporta-se como crescimento. As
 * famílias financeiro e cíclica não são reclassificadas por dados, porque a razão
 * ali é estrutural — nenhum payout torna um banco avaliável por FCFF.
 */

/** Segmento B3 (`segmentName`) → família. Vence a classificação por subsetor. */
const SEGMENT_FAMILY: Record<string, MethodFamily> = {
  'Exploração de Rodovias': 'pagadora',
  'Transporte Ferroviário': 'pagadora',
  'Água e Saneamento': 'pagadora',
  'Energia Elétrica': 'pagadora',
  Gás: 'pagadora',
  Telecomunicações: 'pagadora',
}

/** Subsetor B3 (`subsectorName`) → família. Vence a classificação por setor. */
const SUBSECTOR_FAMILY: Record<string, MethodFamily> = {
  'Intermediários Financeiros': 'financeiro',
  'Previdência e Seguros': 'financeiro',
  'Serviços Financeiros Diversos': 'financeiro',
  'Holdings Diversificadas': 'financeiro',
  'Exploração de Imóveis': 'financeiro',
  'Água e Saneamento': 'pagadora',
  'Energia Elétrica': 'pagadora',
  Gás: 'pagadora',
  Telecomunicações: 'pagadora',
  'Construção Civil': 'ciclica',
  'Construção e Engenharia': 'ciclica',
  Agropecuária: 'ciclica',
  'Alimentos Processados': 'ciclica',
  'Siderurgia e Metalurgia': 'ciclica',
  Mineração: 'ciclica',
  'Madeira e Papel': 'ciclica',
  Químicos: 'ciclica',
  Embalagens: 'ciclica',
  'Automóveis e Motocicletas': 'ciclica',
  'Material de Transporte': 'ciclica',
}

/** Setor B3 (`sectorName`) → família. Último nível antes do padrão. */
const SECTOR_FAMILY: Record<string, MethodFamily> = {
  'Utilidade Pública': 'pagadora',
  'Materiais Básicos': 'ciclica',
  'Petróleo. Gás e Biocombustíveis': 'ciclica',
  Comunicações: 'pagadora',
  'Financeiro e Outros': 'financeiro',
}

/** Limiares do ajuste por dados. Explícitos para poderem ser discutidos. */
export const BEHAVIOR_THRESHOLDS = {
  /** Distribui muito e rende muito: comporta-se como pagadora. */
  payerPayout: 0.6,
  payerDividendYield: 0.05,
  /** Receita quase parada reforça a leitura de pagadora. */
  payerMaxRevenueCagr: 0.08,
  /** Retém e cresce: comporta-se como crescimento. */
  growerMaxPayout: 0.4,
  growerMinRevenueCagr: 0.15,
} as const

export interface MethodSelection {
  family: MethodFamily
  /** Método recomendado para a família, antes de checar disponibilidade de dado. */
  recommended: CeilingMethodId
  /** Ordem de degradação quando falta dado para o recomendado. */
  preference: readonly CeilingMethodId[]
  /** Por que esta família, em uma frase — é o texto que a tela mostra. */
  reason: string
  /** `true` quando o comportamento observado mudou a etiqueta do setor. */
  adjustedByBehavior: boolean
}

/**
 * Família pela taxonomia B3, antes de qualquer ajuste por comportamento.
 *
 * Exportada porque o beta também precisa dela: relavancar um banco pela dívida
 * líquida devolveria beta sem sentido, e essa exceção é estrutural — não pode
 * depender do payout que a empresa pagou nos últimos 12 meses.
 */
export function structuralFamily(stock: StockFundamentals): {
  family: MethodFamily
  source: string
} {
  const segment = stock.segmentName?.trim()
  if (segment && SEGMENT_FAMILY[segment]) {
    return { family: SEGMENT_FAMILY[segment], source: segment }
  }
  const subsector = stock.subsectorName?.trim()
  if (subsector && SUBSECTOR_FAMILY[subsector]) {
    return { family: SUBSECTOR_FAMILY[subsector], source: subsector }
  }
  const sector = stock.sectorName?.trim()
  if (sector && SECTOR_FAMILY[sector]) {
    return { family: SECTOR_FAMILY[sector], source: sector }
  }
  return { family: 'crescimento', source: sector || subsector || segment || 'sem setor na fonte' }
}

const STRUCTURAL_REASON: Record<MethodFamily, (source: string) => string> = {
  financeiro: (source) =>
    `${source}: para instituição financeira a dívida é insumo, então FCFF e EBITDA não se definem. O teto sai do patrimônio pelo P/VP justificado, (ROE − g)/(k − g).`,
  pagadora: (source) =>
    `${source}: receita regulada ou madura, com payout alto e crescimento real baixo. O fluxo que chega ao acionista é o dividendo, então é ele que se desconta.`,
  ciclica: (source) =>
    `${source}: resultado cíclico e irregular. Projetar o lucro dos últimos 12 meses multiplicaria um resultado de pico ou de fundo, então o teto vem da média geométrica com o patrimônio.`,
  crescimento: (source) =>
    `${source}: reinveste a maior parte do lucro, e o valor está na trajetória do resultado. Desconta-se o fluxo distribuível projetado, com a trava de retenção que o crescimento exige.`,
}

function behaviorReason(family: MethodFamily, stock: StockFundamentals): string {
  const payout = stock.payout == null ? '—' : `${(stock.payout * 100).toFixed(0)}%`
  const dy = stock.dividendYield == null ? '—' : `${(stock.dividendYield * 100).toFixed(1)}%`
  const cagr = stock.revenueCagr5 == null ? '—' : `${(stock.revenueCagr5 * 100).toFixed(1)}%`
  if (family === 'pagadora') {
    return `O setor não é de concessão, mas o comportamento é de pagadora: payout de ${payout}, DY de ${dy} e receita crescendo ${cagr} ao ano. Vale a régua do dividendo.`
  }
  return `O setor é de distribuição estável, mas esta retém caixa e cresce: payout de ${payout} e receita crescendo ${cagr} ao ano. Vale a régua do fluxo projetado.`
}

/** Escolhe a família e o método recomendado do ativo. */
export function selectMethod(stock: StockFundamentals): MethodSelection {
  const { family: structural, source } = structuralFamily(stock)

  let family = structural
  let adjustedByBehavior = false

  // Só o par crescimento/pagadora é ajustável por comportamento: a razão de
  // banco e de cíclica é estrutural, e payout nenhum a desfaz.
  if (structural === 'crescimento' || structural === 'pagadora') {
    const { payout, dividendYield, revenueCagr5 } = stock
    const behavesAsPayer =
      payout != null &&
      payout >= BEHAVIOR_THRESHOLDS.payerPayout &&
      dividendYield != null &&
      dividendYield >= BEHAVIOR_THRESHOLDS.payerDividendYield &&
      (revenueCagr5 == null || revenueCagr5 <= BEHAVIOR_THRESHOLDS.payerMaxRevenueCagr)
    const behavesAsGrower =
      (payout == null || payout < BEHAVIOR_THRESHOLDS.growerMaxPayout) &&
      revenueCagr5 != null &&
      revenueCagr5 >= BEHAVIOR_THRESHOLDS.growerMinRevenueCagr

    if (structural === 'crescimento' && behavesAsPayer) {
      family = 'pagadora'
      adjustedByBehavior = true
    } else if (structural === 'pagadora' && behavesAsGrower) {
      family = 'crescimento'
      adjustedByBehavior = true
    }
  }

  const preference = FAMILY_PREFERENCE[family]
  return {
    family,
    recommended: preference[0],
    preference,
    reason: adjustedByBehavior
      ? behaviorReason(family, stock)
      : STRUCTURAL_REASON[family](source),
    adjustedByBehavior,
  }
}

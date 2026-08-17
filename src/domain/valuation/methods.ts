/**
 * Catálogo de métodos de preço teto.
 *
 * Não existe uma fórmula certa para toda ação. O que muda de um ativo para outro
 * não é a preferência de quem calcula, é a economia do negócio: qual fluxo chega
 * ao acionista, se esse fluxo é projetável e se o balanço ou o resultado é a
 * base mais estável. Este arquivo é a lista fechada dos métodos que o sistema
 * sabe aplicar, com o que cada um pede e onde cada um falha — o texto daqui é o
 * mesmo que a tela mostra, para o usuário saber por que está vendo aquele número.
 */

export type CeilingMethodId =
  | 'fcd-2-fases'
  | 'ddm-gordon'
  | 'bazin'
  | 'renda-residual'
  | 'numero-graham'

/**
 * Famílias de ativo, no sentido de "o que decide o valor aqui".
 *
 * A família vem da natureza do negócio (setor B3) e, entre crescimento e
 * pagadora, também do comportamento observado nos dados. Ela não é o método:
 * cada família tem uma ordem de preferência de métodos, e o primeiro que tiver
 * dado suficiente é o que roda.
 */
export type MethodFamily = 'crescimento' | 'pagadora' | 'financeiro' | 'ciclica'

/** Premissas que um método pode exigir. Nomes iguais aos de `StockFundamentals`. */
export type MethodInput =
  | 'netIncome'
  | 'payout'
  | 'returnOnEquity'
  | 'discountRate'
  | 'sharesOutstanding'
  | 'dividendPerShare'
  | 'requiredYield'
  | 'earningsPerShare'
  | 'bookValuePerShare'

export interface CeilingMethodDescriptor {
  id: CeilingMethodId
  /** Nome completo, para título e seletor. */
  label: string
  /** Nome curto, para caber na linha do ranking. */
  short: string
  /** O fluxo (ou base) que o método desconta. */
  flow: string
  formula: string
  /** Onde o método é o mais defensável. */
  fits: string
  /** Onde ele erra — dito explicitamente, porque escolher método é escolher erro. */
  limits: string
  /** Origem do método, para não parecer regra inventada. */
  source: string
  inputs: readonly MethodInput[]
}

export const CEILING_METHODS: Record<CeilingMethodId, CeilingMethodDescriptor> = {
  'fcd-2-fases': {
    id: 'fcd-2-fases',
    label: 'FCD em 2 fases',
    short: 'FCD',
    flow: 'fluxo distribuível (FCFE = LL × (1 − g/ROE))',
    formula: 'Σ FCFEₜ/(1+k)ᵗ + [FCFE₄/(k − g∞)]/(1+k)³, dividido pelas ações',
    fits: 'Empresa que reinveste e cresce: o valor está na trajetória do resultado, e a trava de retenção mostra quanto do lucro pode de fato sair da empresa.',
    limits: 'Extrapola o lucro dos últimos 12 meses. Em cíclica de commodity isso significa projetar lucro de pico; em banco, ignorar que capital regulatório não é caixa livre.',
    source: 'Fluxo de caixa descontado em dois estágios (Gordon–Shapiro na perpetuidade), conforme src/docs/BBAS3.MD.',
    inputs: ['netIncome', 'payout', 'returnOnEquity', 'discountRate', 'sharesOutstanding'],
  },
  'ddm-gordon': {
    id: 'ddm-gordon',
    label: 'Dividendos descontados (Gordon)',
    short: 'DDM',
    flow: 'dividendo por ação',
    formula: 'Σ DPAₜ/(1+k)ᵗ + [DPA₄/(k − g∞)]/(1+k)³',
    fits: 'Concessão e negócio maduro que distribui o que gera: energia, saneamento, telecom, seguradora. O acionista recebe dividendo, não lucro contábil.',
    limits: 'Só vale o que é pago: subestima quem retém caixa por escolha. Sensível a dividendo extraordinário e a concessão com prazo finito, que não tem perpetuidade.',
    source: 'Modelo de desconto de dividendos de Williams (1938) com crescimento de Gordon–Shapiro (1956).',
    inputs: ['dividendPerShare', 'payout', 'returnOnEquity', 'discountRate'],
  },
  bazin: {
    id: 'bazin',
    label: 'Bazin (teto por yield exigido)',
    short: 'Bazin',
    flow: 'dividendo por ação',
    formula: 'DPA ÷ yield exigido',
    fits: 'Pagadora consistente, quando o objetivo é renda: define o preço máximo que ainda entrega o yield que você exige.',
    limits: 'Não é valuation de fluxo — ignora crescimento e reinvestimento por completo. Um dividendo extraordinário no período infla o teto.',
    source: 'Décio Bazin, "Faça Fortuna com Ações" (1991): preço teto = dividendo médio de 5 anos ÷ 6%.',
    inputs: ['dividendPerShare', 'requiredYield'],
  },
  'renda-residual': {
    id: 'renda-residual',
    label: 'Renda residual (P/VP justificado)',
    short: 'Residual',
    flow: 'retorno sobre o patrimônio acima do custo de capital',
    formula: 'VPA × (ROE − g) ÷ (k − g)',
    fits: 'Banco, seguradora e holding: para instituição financeira dívida é insumo, então FCFF e EBITDA não se definem, e o patrimônio é a base estável. O múltiplo justo de patrimônio sai do ROE contra o k exigido.',
    limits: 'Depende de patrimônio contábil fiel e de ROE sustentável. ROE inflado por alavancagem ou por um trimestre atípico contamina o teto.',
    source: 'Renda residual de Ohlson (1995); P/VP justificado como em Damodaran, "Valuing Financial Service Firms".',
    inputs: ['bookValuePerShare', 'returnOnEquity', 'discountRate', 'payout'],
  },
  'numero-graham': {
    id: 'numero-graham',
    label: 'Número de Graham',
    short: 'Graham',
    flow: 'lucro e patrimônio por ação (média geométrica)',
    formula: '√(22,5 × LPA × VPA)',
    fits: 'Cíclica e intensiva em ativo, quando projetar o lucro é chute: a raiz do produto amortece o lucro de pico com o patrimônio.',
    limits: 'É um teto de triagem, não um valuation: não desconta fluxo, não vê dívida e não vê crescimento. Graham nunca derivou o 22,5 — ele é o produto dos limites defensivos P/L ≤ 15 e P/VP ≤ 1,5.',
    source: 'Benjamin Graham, "O Investidor Inteligente", critérios do investidor defensivo (P/L ≤ 15 e P/VP ≤ 1,5).',
    inputs: ['earningsPerShare', 'bookValuePerShare'],
  },
}

export const CEILING_METHOD_IDS = Object.keys(CEILING_METHODS) as CeilingMethodId[]

/**
 * Ordem de preferência de método por família.
 *
 * A primeira posição é o método defensável para aquela economia; as seguintes são
 * a degradação aceitável quando a fonte não trouxe o dado que a primeira exige.
 * Ex.: pagadora sem DY na fonte cai para o FCD, que só precisa de lucro e ROE.
 *
 * O número de Graham aparece só onde é o recomendado (cíclica) e nunca como
 * degradação de outra família. Medido: com ele na cadeia, 73 das 158 ações do
 * ranking caíam nele — ele exige apenas LPA e VPA, então virava o destino de todo
 * ativo cuja premissa faltava, e por não descontar fluxo devolve teto mais
 * generoso que os outros. O efeito era o pior dado subir ao topo da lista, o
 * mesmo defeito do ROE de 366% que o limite de crescimento já corrige. Quando
 * nenhum método aplicável fecha, a ação sai da lista em vez de ser avaliada por
 * uma régua que não é a dela.
 */
export const FAMILY_PREFERENCE: Record<MethodFamily, readonly CeilingMethodId[]> = {
  pagadora: ['ddm-gordon', 'bazin', 'fcd-2-fases', 'renda-residual'],
  crescimento: ['fcd-2-fases', 'renda-residual'],
  financeiro: ['renda-residual', 'ddm-gordon'],
  ciclica: ['numero-graham', 'renda-residual'],
}

export const FAMILY_LABELS: Record<MethodFamily, string> = {
  crescimento: 'crescimento',
  pagadora: 'pagadora de dividendos',
  financeiro: 'financeiro',
  ciclica: 'cíclica',
}

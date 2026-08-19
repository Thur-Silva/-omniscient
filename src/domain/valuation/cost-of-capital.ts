import { ValuationError } from '../errors/valuation-error'

/**
 * Custo de capital: de onde sai a taxa que desconta o fluxo.
 *
 * Antes deste arquivo a taxa era escolha de tela — o usuário clicava 18% e todos
 * os modelos usavam 18%. Retorno exigido é, de fato, escolha do investidor, mas
 * "escolha" não significa "arbitrário": há um custo de oportunidade observável, e
 * ele não é o mesmo para uma concessionária de saneamento e para uma
 * incorporadora. Uma taxa única aplicada ao mercado inteiro premia sistematicamente
 * o ativo de risco alto, que é justamente quem aparece no topo de um ranking por
 * desconto.
 *
 * Duas taxas moram aqui, e cada uma pertence a um fluxo:
 *
 *  · **Ke, custo de capital próprio (CAPM)** — desconta fluxo do acionista: FCFE,
 *    dividendo, renda residual. `Ke = Rf + β × ERP`.
 *  · **WACC, custo médio ponderado de capital** — desconta fluxo da firma (FCFF),
 *    o caixa que sobra para todos os investidores, credor incluído:
 *    `WACC = Ke × E/(D+E) + Kd × (1 − t) × D/(D+E)`.
 *
 * Casar fluxo com taxa não é preciosismo: descontar fluxo do acionista a WACC
 * credita ao acionista o benefício fiscal da dívida sem cobrar dele o serviço
 * dessa dívida, e descontar fluxo da firma a Ke faz o contrário. O erro tem sinal
 * conhecido — nos dois casos infla o teto da empresa alavancada.
 *
 * ### Como o prêmio é montado, e o que não fazemos
 *
 * O caminho ingênuo seria somar à Selic o "ERP do Brasil" de tabela (~7,7%). Isso
 * conta risco-país duas vezes: o título público brasileiro já paga o spread de
 * inadimplência do soberano, e o ERP de país é derivado desse mesmo spread. A
 * montagem em moeda local (Damodaran, "Country Risk: Determinants, Measures and
 * Implications") tira o spread do soberano da taxa livre de risco e devolve o
 * risco-país no prêmio de equity, onde ele é amplificado pela volatilidade
 * relativa da bolsa contra o título:
 *
 *     Rf_limpo = Rf_nominal − spread de inadimplência do soberano
 *     ERP      = ERP de mercado maduro + spread × volatilidade relativa
 *     Ke       = Rf_limpo + β × ERP + prêmio adicional
 *
 * O prêmio adicional começa em zero e existe para o usuário cobrar o que a teoria
 * não cobra: iliquidez, governança, concentração de controlador.
 */

/**
 * IRPJ 25% + CSLL 9%: a alíquota estatutária do lucro real, que é a base do
 * benefício fiscal da dívida. Não é a alíquota efetiva de cada empresa — essa
 * varia com JCP, incentivo e prejuízo acumulado, e a fonte não a publica.
 */
export const CORPORATE_TAX_RATE = 0.34

/**
 * Prêmio de risco de mercado maduro, sobre o qual o risco-país é somado.
 *
 * É o prêmio implícito do mercado americano — o que o S&P 500 embute nos preços
 * dados os fluxos esperados —, na ordem de 4,3% nas séries de Damodaran. Vale como
 * prêmio de um mercado sem risco soberano relevante; o Brasil entra a seguir, via
 * `COUNTRY_RISK_PREMIUM`.
 */
export const MATURE_EQUITY_RISK_PREMIUM = 0.0433

/**
 * Spread de inadimplência do soberano brasileiro, pela faixa de rating (BB/Ba).
 *
 * Entra duas vezes, com sinais opostos e de propósito: subtraído da taxa livre de
 * risco nominal, porque título que pode dar default não é ativo livre de risco; e
 * somado ao prêmio de equity, amplificado, porque ação brasileira carrega esse
 * mesmo risco com mais alavancagem que o título.
 */
export const BRAZIL_DEFAULT_SPREAD = 0.024

/**
 * Volatilidade da bolsa contra a do título soberano.
 *
 * Ação não sofre o risco-país na mesma intensidade que o título: sofre mais. O
 * fator ~1,4 é a razão de desvios-padrão que Damodaran usa para converter spread
 * de crédito em prêmio de risco de ações.
 */
export const RELATIVE_EQUITY_VOLATILITY = 1.42

/** Prêmio de risco-país de equity: o spread do soberano, amplificado. */
export const COUNTRY_RISK_PREMIUM = BRAZIL_DEFAULT_SPREAD * RELATIVE_EQUITY_VOLATILITY

/** Prêmio total exigido de um ativo com β = 1 no Brasil. */
export const EQUITY_RISK_PREMIUM = MATURE_EQUITY_RISK_PREMIUM + COUNTRY_RISK_PREMIUM

/**
 * Taxa livre de risco de reserva, usada só quando o Banco Central não responde.
 *
 * Fica explícita e datada em vez de escondida: é a Selic efetiva de 18/08/2026.
 * Toda tela que cai nela avisa que o número é de reserva, porque juro defasado
 * muda o teto de todo o mercado de uma vez.
 */
export const FALLBACK_RISK_FREE_RATE = 0.139

export interface CapmInput {
  /** Taxa livre de risco nominal em reais, como fração. */
  riskFreeRate: number
  /** Beta a aplicar ao prêmio de equity. */
  beta: number
  maturePremium?: number
  countryRiskPremium?: number
  /** Spread do soberano a retirar da taxa livre de risco. */
  defaultSpread?: number
  /** Prêmio adicional do usuário: iliquidez, governança, controlador. */
  extraPremium?: number
}

export interface CapmBreakdown {
  /** Taxa nominal como o Banco Central publica, antes de limpar o spread. */
  riskFreeRate: number
  defaultSpread: number
  /** `Rf − spread`: o que sobra depois de tirar o risco de crédito do soberano. */
  cleanRiskFreeRate: number
  beta: number
  maturePremium: number
  countryRiskPremium: number
  /** `maduro + país`: o prêmio de um ativo com β = 1. */
  equityRiskPremium: number
  /** `β × prêmio`: o prêmio deste ativo. */
  assetPremium: number
  extraPremium: number
  /** Custo de capital próprio, como fração. */
  costOfEquity: number
}

/** Ke pelo CAPM, na montagem em moeda local descrita no topo do arquivo. */
export function costOfEquity(input: CapmInput): CapmBreakdown {
  const {
    riskFreeRate,
    beta,
    maturePremium = MATURE_EQUITY_RISK_PREMIUM,
    countryRiskPremium = COUNTRY_RISK_PREMIUM,
    defaultSpread = BRAZIL_DEFAULT_SPREAD,
    extraPremium = 0,
  } = input

  if (!Number.isFinite(riskFreeRate) || riskFreeRate <= 0) {
    throw new ValuationError('A taxa livre de risco precisa ser positiva.')
  }
  if (!Number.isFinite(beta) || beta <= 0) {
    throw new ValuationError('O beta precisa ser positivo: risco negativo não se desconta.')
  }
  if (!Number.isFinite(extraPremium) || extraPremium < 0) {
    throw new ValuationError('O prêmio adicional não pode ser negativo.')
  }

  const cleanRiskFreeRate = Math.max(0, riskFreeRate - defaultSpread)
  const equityRiskPremium = maturePremium + countryRiskPremium
  const assetPremium = beta * equityRiskPremium

  return {
    riskFreeRate,
    defaultSpread,
    cleanRiskFreeRate,
    beta,
    maturePremium,
    countryRiskPremium,
    equityRiskPremium,
    assetPremium,
    extraPremium,
    costOfEquity: cleanRiskFreeRate + assetPremium + extraPremium,
  }
}

/**
 * Spread de crédito por alavancagem, em degraus.
 *
 * O caminho canônico é o rating sintético pela cobertura de juros
 * (EBIT ÷ despesa financeira), mas a fonte não publica despesa financeira. O que
 * ela publica é dívida líquida sobre EBIT, que mede a mesma coisa por outro lado:
 * quantos anos de resultado operacional a dívida representa. A escada é grossa de
 * propósito — é premissa de crédito, não medição — e o spread resultante pode ser
 * corrigido à mão na calculadora.
 */
export const DEBT_SPREAD_LADDER: readonly { maxNetDebtToEbit: number; spread: number }[] = [
  { maxNetDebtToEbit: 0, spread: 0.012 },
  { maxNetDebtToEbit: 1, spread: 0.017 },
  { maxNetDebtToEbit: 2, spread: 0.022 },
  { maxNetDebtToEbit: 3, spread: 0.03 },
  { maxNetDebtToEbit: 4, spread: 0.045 },
  { maxNetDebtToEbit: 6, spread: 0.065 },
  { maxNetDebtToEbit: Number.POSITIVE_INFINITY, spread: 0.09 },
]

/**
 * Spread da empresa. Sem o indicador na fonte, assume o degrau intermediário: a
 * alternativa seria recusar a empresa por falta de um dado de crédito, severo
 * demais para uma premissa que o usuário pode corrigir na tela.
 */
export function syntheticDebtSpread(netDebtToEbit: number | null | undefined): number {
  if (netDebtToEbit == null || !Number.isFinite(netDebtToEbit)) return 0.03
  const tier = DEBT_SPREAD_LADDER.find((entry) => netDebtToEbit <= entry.maxNetDebtToEbit)
  return tier?.spread ?? 0.09
}

export interface CostOfDebtBreakdown {
  riskFreeRate: number
  /** Dívida líquida sobre EBIT que definiu o degrau, quando havia o dado. */
  netDebtToEbit: number | null
  spread: number
  /** `Rf + spread`: o que a empresa paga ao credor, antes do imposto. */
  grossCostOfDebt: number
  taxRate: number
  /** `Kd × (1 − t)`: o custo que sobra depois do benefício fiscal. */
  afterTaxCostOfDebt: number
}

/**
 * Kd depois do imposto.
 *
 * Juro é despesa dedutível, então cada real de juro devolve `t` reais de imposto
 * economizado. É a única razão pela qual alavancagem barateia o custo de capital
 * de uma empresa lucrativa — e é por isso que o benefício aparece na taxa (aqui,
 * no WACC) e não como um fluxo separado.
 */
export function costOfDebt(input: {
  riskFreeRate: number
  netDebtToEbit?: number | null
  spread?: number
  taxRate?: number
}): CostOfDebtBreakdown {
  const {
    riskFreeRate,
    netDebtToEbit = null,
    spread = syntheticDebtSpread(netDebtToEbit),
    taxRate = CORPORATE_TAX_RATE,
  } = input

  if (!Number.isFinite(riskFreeRate) || riskFreeRate <= 0) {
    throw new ValuationError('A taxa livre de risco precisa ser positiva.')
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate >= 1) {
    throw new ValuationError('A alíquota de imposto precisa ficar entre 0% e 100%.')
  }

  const grossCostOfDebt = riskFreeRate + spread
  return {
    riskFreeRate,
    netDebtToEbit: netDebtToEbit != null && Number.isFinite(netDebtToEbit) ? netDebtToEbit : null,
    spread,
    grossCostOfDebt,
    taxRate,
    afterTaxCostOfDebt: grossCostOfDebt * (1 - taxRate),
  }
}

export interface WaccBreakdown {
  capm: CapmBreakdown
  debt: CostOfDebtBreakdown
  /** Valor de mercado do capital próprio: capitalização, não patrimônio contábil. */
  equityValue: number
  /** Dívida líquida como veio da fonte; caixa líquido fica negativo aqui. */
  netDebt: number
  totalCapital: number
  equityWeight: number
  debtWeight: number
  /** Custo médio ponderado de capital, como fração. */
  wacc: number
  /** `true` quando a empresa tem caixa líquido e o WACC colapsa em Ke. */
  netCash: boolean
}

/**
 * WACC com pesos de mercado.
 *
 * Os pesos são de valor de mercado, não de balanço: custo de capital é o retorno
 * exigido sobre o que se pagaria hoje pela empresa, e patrimônio contábil não é
 * isso. Caixa líquido não vira peso negativo — dívida negativa puxaria o WACC
 * abaixo de Ke e devolveria teto maior por a empresa ter caixa, confundindo
 * estrutura de capital com valor de ativo. Nesse caso o peso da dívida é zero e o
 * WACC é o próprio Ke; o caixa aparece onde deve, somando ao valor do acionista
 * quando a dívida líquida negativa é subtraída do valor da firma.
 */
export function weightedAverageCostOfCapital(input: {
  capm: CapmBreakdown
  debt: CostOfDebtBreakdown
  equityValue: number
  netDebt: number
}): WaccBreakdown {
  const { capm, debt, equityValue } = input

  if (!Number.isFinite(equityValue) || equityValue <= 0) {
    throw new ValuationError('O valor de mercado do capital próprio precisa ser positivo.')
  }
  if (!Number.isFinite(input.netDebt)) {
    throw new ValuationError('A dívida líquida precisa ser um número.')
  }

  const netCash = input.netDebt < 0
  const netDebt = netCash ? 0 : input.netDebt
  const totalCapital = equityValue + netDebt
  const equityWeight = equityValue / totalCapital
  const debtWeight = netDebt / totalCapital

  return {
    capm,
    debt,
    equityValue,
    netDebt: input.netDebt,
    totalCapital,
    equityWeight,
    debtWeight,
    wacc: capm.costOfEquity * equityWeight + debt.afterTaxCostOfDebt * debtWeight,
    netCash,
  }
}

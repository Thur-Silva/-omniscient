/**
 * Taxa livre de risco: a única premissa do custo de capital que é observável.
 *
 * Beta é estimativa, prêmio de risco é premissa, spread é premissa. A taxa livre
 * de risco não: é um número publicado, e por isso vem de fora em vez de ficar
 * escrito no código. Quando muda — e no Brasil ela muda a cada reunião do Copom —
 * o teto de todo o mercado muda com ela, o que é o comportamento correto e a razão
 * de a leitura ser datada.
 */
export interface RiskFreeRate {
  /** Taxa nominal anual, como fração: 0,139 é 13,9%. */
  rate: number
  /** Data da observação, como a fonte publica (ISO). */
  asOf: string
  /** Nome da série, para a tela citar a origem. */
  label: string
  /** `true` quando o número é o de reserva do código, não o da fonte. */
  fallback: boolean
}

export interface RiskFreeRateProvider {
  /** Última observação publicada. `null` quando a fonte não respondeu. */
  current(signal?: AbortSignal): Promise<RiskFreeRate | null>
}

/** Escalas da régua do instrumento. Fica fora do componente para o fast refresh
 *  do Vite continuar valendo no arquivo do SafetyGauge. */

export interface Scale {
  lo: number
  hi: number
  step: number
}

/** Passos "redondos" para a régua não cair em 7,3% ou 13,6%. */
export function niceStep(rough: number): number {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]
  return candidates.find((c) => c >= rough) ?? 1000
}

/** Escala própria de um instrumento isolado, ajustada aos seus marcos. */
export function buildScale(marks: number[]): Scale {
  const points = [0, ...marks]
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(max - min, 10)
  const step = niceStep(span / 3)
  return {
    lo: Math.floor((min - span * 0.1) / step) * step,
    hi: Math.ceil((max + span * 0.1) / step) * step,
    step,
  }
}

/**
 * Régua comum para um conjunto de posições: pega o maior desvio de todas e
 * arredonda para um passo redondo, simétrico em torno do custo. Sem isso uma
 * queda de 8% desenharia a mesma barra que uma alta de 17%.
 */
export function buildSharedScale(deviations: number[]): Scale {
  const widest = Math.max(10, ...deviations.filter((d) => Number.isFinite(d)).map(Math.abs))
  const step = niceStep(widest / 2)
  const bound = Math.ceil(widest / step) * step
  return { lo: -bound, hi: bound, step }
}

export function ratio(value: number, scale: Scale): number {
  const span = scale.hi - scale.lo
  if (span <= 0) return 50
  return Math.min(100, Math.max(0, ((value - scale.lo) / span) * 100))
}

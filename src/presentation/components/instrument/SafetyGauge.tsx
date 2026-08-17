import { motion, useReducedMotion } from 'motion/react'
import { buildScale, ratio, type Scale } from './scale'

export interface SafetyGaugeProps {
  /** Datum da escala: o que a posição custou. */
  costBasis: number
  /** Onde o mercado está agora. */
  marketValue: number | null
  /** Onde o modelo diz que deveria estar. Ausente quando não há fundamentos. */
  fairValue?: number | null
  size?: 'hero' | 'row'
  /**
   * De que lado do datum está a boa notícia.
   *
   * `gain` (padrão): o datum é o custo, e acima dele é lucro — o caso da carteira.
   * `discount`: o datum é o valor justo, e abaixo dele é desconto — o caso da
   * triagem. Sem esta distinção uma ação barata apareceria com barra vermelha,
   * contradizendo o próprio veredicto do cartão.
   */
  polarity?: 'gain' | 'discount'
  /**
   * Rótulo do zero da escala. Muda com o que o datum representa: na carteira é o
   * custo da posição, no valuation é o preço teto.
   */
  datumLabel?: string
  /**
   * Escala imposta de fora. Numa lista de posições os instrumentos ficam lado a
   * lado e convidam à comparação, então todos precisam da mesma régua — com
   * escala própria uma queda de 8% desenharia a mesma barra que uma alta de 17%.
   */
  domain?: Scale
  /** Rótulo acessível — o gauge é uma imagem de dados. */
  label?: string
}

function formatSigned(value: number, digits = 1): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
}

/**
 * O instrumento da aplicação: mede a folga entre preço e valor.
 *
 * A escala é percentual sobre o custo, então o zero é sempre "o que você pagou".
 * A barra vai do custo até o mercado (magnitude do retorno). A folga até o valor
 * justo — a margem de segurança — é anotada como linha de cota, a notação de
 * desenho técnico para medir um vão. Preencher esse vão com hachura fazia o
 * instrumento parecer poste de barbeiro.
 */
export default function SafetyGauge({
  costBasis,
  marketValue,
  fairValue,
  size = 'hero',
  polarity = 'gain',
  datumLabel = 'custo',
  domain,
  label,
}: SafetyGaugeProps) {
  const reduce = useReducedMotion()
  const isHero = size === 'hero'

  if (costBasis <= 0 || marketValue == null) {
    return <div className={`gauge is-${size} is-idle`} aria-hidden="true" />
  }

  const marketPct = (marketValue / costBasis - 1) * 100
  const fairPct = fairValue != null && fairValue > 0 ? (fairValue / costBasis - 1) * 100 : null
  const scale = domain ?? buildScale(fairPct == null ? [marketPct] : [marketPct, fairPct])

  const datumAt = ratio(0, scale)
  const marketAt = ratio(marketPct, scale)
  const fairAt = fairPct == null ? null : ratio(fairPct, scale)

  // Favorável = a leitura que o usuário quer ver, conforme a polaridade.
  const favourable = polarity === 'discount' ? marketPct <= 0 : marketPct >= 0
  const clearance = fairPct == null ? null : fairPct - marketPct

  const majors: number[] = []
  for (let v = scale.lo; v <= scale.hi + 1e-6; v += scale.step) majors.push(Number(v.toFixed(4)))

  const minorStep = scale.step / 4
  const minors: number[] = []
  for (let v = scale.lo; v <= scale.hi + 1e-6; v += minorStep) {
    const rounded = Number(v.toFixed(4))
    if (!majors.includes(rounded)) minors.push(rounded)
  }

  const spring = reduce
    ? { duration: 0 }
    : // Mola sub-amortecida: o ponteiro passa do ponto e assenta, como medidor real.
      { type: 'spring' as const, stiffness: 58, damping: 11, mass: 1.1, delay: 0.3 }

  const sweep = reduce
    ? { duration: 0 }
    : { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const, delay: 0.14 }

  return (
    <div
      className={`gauge is-${size}`}
      role="img"
      aria-label={
        label ??
        `Mercado ${formatSigned(marketPct)} sobre o custo` +
          (clearance == null ? '' : `, folga de ${formatSigned(clearance)} até o valor justo`)
      }
    >
      {/* Linha de cota: a margem de segurança medida entre mercado e valor justo */}
      {isHero && fairAt != null && clearance != null && (
        <motion.div
          className={`gauge-dimension ${clearance >= 0 ? 'is-open' : 'is-negative'}`}
          style={{
            left: `${Math.min(marketAt, fairAt)}%`,
            width: `${Math.abs(fairAt - marketAt)}%`,
          }}
          initial={reduce ? undefined : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.72 }}
        >
          <span className="gauge-dimension-rule" />
          <span className="gauge-dimension-value">{formatSigned(clearance)}</span>
        </motion.div>
      )}

      <div className="gauge-body">
        {/* Trilho e magnitude do retorno */}
        <div className="gauge-rail">
          <motion.div
            className={`gauge-band ${favourable ? 'is-up' : 'is-down'}`}
            style={{ left: `${Math.min(datumAt, marketAt)}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.abs(marketAt - datumAt)}%` }}
            transition={sweep}
          />
          <span className="gauge-datum" style={{ left: `${datumAt}%` }} />
        </div>

        {/* Alvo: caret de latão sob o trilho, apontando para o valor justo */}
        {fairAt != null && (
          <motion.span
            className="gauge-target"
            style={{ left: `${fairAt}%` }}
            initial={reduce ? undefined : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, delay: 0.62 }}
          />
        )}

        {/* Ponteiro sobre o trilho, com cabeça apontando para baixo */}
        <motion.span
          className={`gauge-needle ${favourable ? 'is-up' : 'is-down'}`}
          initial={reduce ? { left: `${marketAt}%` } : { left: `${datumAt}%` }}
          animate={{ left: `${marketAt}%` }}
          transition={spring}
        />
      </div>

      {isHero && (
        <>
          {/* Régua de desenho: traços menores entre os principais */}
          <div className="gauge-ruler">
            {minors.map((tick) => (
              <span key={`m${tick}`} className="gauge-tick" style={{ left: `${ratio(tick, scale)}%` }} />
            ))}
            {majors.map((tick) => (
              <span
                key={`M${tick}`}
                className={`gauge-tick is-major${tick === 0 ? ' is-datum' : ''}`}
                style={{ left: `${ratio(tick, scale)}%` }}
              />
            ))}
          </div>

          <div className="gauge-labels">
            {majors.map((tick) => (
              <span
                key={tick}
                className={`gauge-label${tick === 0 ? ' is-datum' : ''}`}
                style={{ left: `${ratio(tick, scale)}%` }}
              >
                {tick === 0 ? datumLabel : formatSigned(tick, 0)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

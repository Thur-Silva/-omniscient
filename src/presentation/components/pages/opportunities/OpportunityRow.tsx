import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { FII_CATEGORY_LABELS } from '../../../../domain/fii/fundamentals'
import type { RankedFii } from '../../../../domain/fii/ranking'

interface OpportunityRowProps {
  entry: RankedFii
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function money(value: number | null): string {
  return value == null ? '—' : brl.format(value)
}

export default function OpportunityRow({ entry }: OpportunityRowProps) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const detailId = useId()

  const { fundamentals: f, dividendYieldRank, priceToBookRank, score, position } = entry

  // Destaque vem da colocação geral, não da posição na tela: com filtro ativo o
  // primeiro item visível pode ser o 7º do ranking.
  const isPodium = position <= 3

  return (
    <div className={`rank-item${open ? ' is-open' : ''}${isPodium ? ' is-podium' : ''}`}>
      <button
        type="button"
        className="rank-summary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
      >
        <span className="rank-position">{position}</span>

        <span className="rank-identity">
          <strong className="ticker">{f.ticker}</strong>
          <span>
            <i className={`cat-dot is-${f.category}`} aria-hidden="true" />
            {FII_CATEGORY_LABELS[f.category]}
            {/* A fonte às vezes repete a categoria no segmento ("Misto"/"Misto"). */}
            {f.segment && f.segment.toLowerCase() !== FII_CATEGORY_LABELS[f.category].toLowerCase()
              ? ` · ${f.segment}`
              : ''}
          </span>
        </span>

        <span className="rank-metrics">
          <span className="rank-metric">
            <b className="positive">{f.dividendYield?.toFixed(2) ?? '—'}%</b>
            <small>DY</small>
          </span>
          <span className="rank-metric">
            <b>{f.priceToBook?.toFixed(3) ?? '—'}</b>
            <small>P/VP</small>
          </span>
        </span>

        {/* A soma é o critério de ordenação, então aparece na linha. */}
        <span className="rank-score" title={`DY ${dividendYieldRank}º + P/VP ${priceToBookRank}º`}>
          {score}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={detailId}
            className="rank-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    height: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                    opacity: { duration: 0.2, delay: open ? 0.06 : 0 },
                  }
            }
          >
            <dl className="rank-detail-inner">
              <div className="detail-cell">
                <dt>Colocação DY</dt>
                <dd>{dividendYieldRank}º</dd>
              </div>
              <div className="detail-cell">
                <dt>Colocação P/VP</dt>
                <dd>{priceToBookRank}º</dd>
              </div>
              <div className="detail-cell">
                <dt>Soma</dt>
                <dd className="is-value">{score}</dd>
              </div>
              <div className="detail-cell">
                <dt>Cotação</dt>
                <dd>{money(f.price)}</dd>
              </div>
              <div className="detail-cell">
                <dt>VP por cota</dt>
                <dd>{money(f.bookValuePerShare)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Último provento</dt>
                <dd>{money(f.lastDividend)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Liquidez diária</dt>
                <dd>
                  {f.averageDailyLiquidity == null
                    ? '—'
                    : `R$ ${compact.format(f.averageDailyLiquidity)}`}
                </dd>
              </div>
              <div className="detail-cell">
                <dt>Patrimônio</dt>
                <dd>{f.netWorth == null ? '—' : `R$ ${compact.format(f.netWorth)}`}</dd>
              </div>
              <div className="detail-cell">
                <dt>Cotistas</dt>
                <dd>{f.shareholders == null ? '—' : compact.format(f.shareholders)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Fundo</dt>
                <dd className="rank-name">{f.name}</dd>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

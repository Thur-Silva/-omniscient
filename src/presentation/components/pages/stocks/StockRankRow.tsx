import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import type { RankedStock } from '../../../../domain/stock/ranking'

interface StockRankRowProps {
  entry: RankedStock
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function money(value: number | null): string {
  return value == null ? '—' : brl.format(value)
}

export default function StockRankRow({ entry }: StockRankRowProps) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const detailId = useId()

  const {
    fundamentals: f,
    ceiling,
    safetyMargin,
    growthRate,
    uncappedGrowthRate,
    growthCapped,
    priceToEarnings,
    position,
  } = entry

  return (
    <div className={`rank-item${open ? ' is-open' : ''}${position <= 3 ? ' is-podium' : ''}`}>
      {/* Sem soma de colocações: a margem decide sozinha, então a linha não tem
          coluna de placar. */}
      <button
        type="button"
        className="rank-summary no-score"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
      >
        <span className="rank-position">{position}</span>

        <span className="rank-identity">
          <strong className="ticker">{f.ticker}</strong>
          <span>
            {f.sector ?? f.name}
            {/* Aviso curto: o crescimento desta ação foi truncado. */}
            {growthCapped && <em className="capped"> g limitado</em>}
          </span>
        </span>

        <span className="rank-metrics">
          <span className="rank-metric">
            <b>{priceToEarnings == null ? '—' : priceToEarnings.toFixed(1)}</b>
            <small>P/L</small>
          </span>
          <span className="rank-metric is-lead">
            <b className={safetyMargin >= 0 ? 'positive' : 'negative'}>
              {`${safetyMargin > 0 ? '+' : ''}${(safetyMargin * 100).toFixed(1)}%`}
            </b>
            <small>margem</small>
          </span>
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
                <dt>Preço teto</dt>
                <dd className="is-value">{money(ceiling)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Preço de mercado</dt>
                <dd>{money(f.price)}</dd>
              </div>
              <div className="detail-cell">
                {/* Curto para não quebrar em duas linhas e desalinhar a grade. */}
                <dt>Desconto</dt>
                <dd className={`is-value ${safetyMargin >= 0 ? 'positive' : 'negative'}`}>
                  {`${safetyMargin > 0 ? '+' : ''}${(safetyMargin * 100).toFixed(1)}%`}
                </dd>
              </div>
              <div className="detail-cell">
                <dt>P/L</dt>
                <dd>{priceToEarnings == null ? '—' : priceToEarnings.toFixed(1)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Crescimento (g)</dt>
                <dd>
                  {(growthRate * 100).toFixed(2)}%
                  {uncappedGrowthRate != null && (
                    <small className="capped-note">
                      {' '}
                      de {(uncappedGrowthRate * 100).toFixed(1)}%
                    </small>
                  )}
                </dd>
              </div>
              <div className="detail-cell">
                <dt>ROE</dt>
                <dd>{f.returnOnEquity == null ? '—' : `${(f.returnOnEquity * 100).toFixed(2)}%`}</dd>
              </div>
              <div className="detail-cell">
                <dt>Payout</dt>
                <dd>{f.payout == null ? '—' : `${(f.payout * 100).toFixed(1)}%`}</dd>
              </div>
              <div className="detail-cell">
                <dt>Lucro líquido</dt>
                <dd>{f.netIncome == null ? '—' : `R$ ${compact.format(f.netIncome)}`}</dd>
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
                <dt>Empresa</dt>
                <dd className="rank-name">{f.name}</dd>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import type { RankedStock } from '../../../../domain/stock/ranking'
import { CEILING_METHODS, FAMILY_LABELS } from '../../../../domain/valuation/methods'

interface StockRankRowProps {
  entry: RankedStock
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function money(value: number | null): string {
  return value == null ? '—' : brl.format(value)
}

function percent(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`
}

export default function StockRankRow({ entry }: StockRankRowProps) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const detailId = useId()

  const {
    fundamentals: f,
    method,
    requestedMethod,
    fellBack,
    fallbackReason,
    family,
    methodReason,
    adjustedByBehavior,
    ceiling,
    safetyMargin,
    growthRate,
    uncappedGrowthRate,
    growthCapped,
    priceToEarnings,
    position,
  } = entry

  const descriptor = CEILING_METHODS[method]

  return (
    <div className={`rank-item${open ? ' is-open' : ''}${position <= 3 ? ' is-podium' : ''}`}>
      {/* Sem soma de colocações: a margem decide sozinha, então a linha não tem
          coluna de placar. O método ocupa o lugar dela, porque saber por qual
          régua o número saiu é parte de ler o número. */}
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
            <em className={`method-tag is-${family}`}>{descriptor.short}</em>
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
            {/* Por que este método, antes dos números que ele produziu. */}
            <div className="method-note">
              <span className="eyebrow">
                {descriptor.label} · {FAMILY_LABELS[family]}
                {adjustedByBehavior ? ' (por comportamento)' : ''}
              </span>
              <p className="method-formula">{descriptor.formula}</p>
              <p>{methodReason}</p>
              {fellBack && (
                <p className="method-fallback">
                  A régua pedia {CEILING_METHODS[requestedMethod].label}, mas{' '}
                  {fallbackReason ?? 'faltou premissa na fonte'} — o teto acima saiu de{' '}
                  {descriptor.label}.
                </p>
              )}
            </div>

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
                <dt>Desconto</dt>
                <dd className={`is-value ${safetyMargin >= 0 ? 'positive' : 'negative'}`}>
                  {`${safetyMargin > 0 ? '+' : ''}${(safetyMargin * 100).toFixed(1)}%`}
                </dd>
              </div>
              <div className="detail-cell">
                <dt>P/L</dt>
                <dd>{priceToEarnings == null ? '—' : priceToEarnings.toFixed(1)}</dd>
              </div>
              {growthRate != null && (
                <div className="detail-cell">
                  <dt>Crescimento (g)</dt>
                  <dd>
                    {percent(growthRate)}
                    {uncappedGrowthRate != null && (
                      <small className="capped-note"> de {percent(uncappedGrowthRate, 1)}</small>
                    )}
                  </dd>
                </div>
              )}
              <div className="detail-cell">
                <dt>ROE</dt>
                <dd>{percent(f.returnOnEquity)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Payout</dt>
                <dd>{percent(f.payout, 1)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Dividendo (12m)</dt>
                <dd>
                  {money(f.dividendPerShare)}
                  {f.dividendYield != null && (
                    <small className="aside-note"> DY {percent(f.dividendYield, 1)}</small>
                  )}
                </dd>
              </div>
              <div className="detail-cell">
                <dt>VPA</dt>
                <dd>{money(f.bookValuePerShare)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Lucro líquido</dt>
                <dd>{f.netIncome == null ? '—' : `R$ ${compact.format(f.netIncome)}`}</dd>
              </div>
              <div className="detail-cell">
                <dt>Receita (CAGR 5a)</dt>
                <dd>{percent(f.revenueCagr5, 1)}</dd>
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

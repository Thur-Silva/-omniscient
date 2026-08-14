import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import type { PositionView } from '../../../../application/portfolio/load-portfolio'
import { ASSET_TYPE_LABELS, type Currency } from '../../../../domain/asset/type'
import SafetyGauge from '../../instrument/SafetyGauge'
import type { Scale } from '../../instrument/scale'

interface PositionRowProps {
  row: PositionView
  money: (value: number | null | undefined, currency?: Currency) => string
  onRemove: (id: string) => void
  /** Régua compartilhada por todas as linhas, para os instrumentos comparáveis. */
  domain?: Scale
}

function signClass(value: number | null | undefined): string {
  if (value == null) return ''
  return value >= 0 ? 'positive' : 'negative'
}

function signedPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

/** `acquiredAt` é ISO (yyyy-mm-dd); exibir cru soaria a dado de banco. */
function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString('pt-BR')
}

export default function PositionRow({ row, money, onRemove, domain }: PositionRowProps) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const detailId = useId()

  const { position, quote, fairValue, safetyMargin, quoteError } = row
  const currency = quote?.currency ?? position.currency
  const invested = position.quantity * position.averagePrice
  const currentValue = quote == null ? null : position.quantity * quote.price
  const profit = currentValue == null ? null : currentValue - invested
  const profitPercent = profit == null || invested === 0 ? null : (profit / invested) * 100

  return (
    <div className={`position${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="position-summary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
      >
        <span className="position-identity">
          <strong>{position.ticker}</strong>
          <span>{quoteError ?? quote?.longName ?? position.name ?? '—'}</span>
        </span>

        <span className="position-gauge-cell">
          <SafetyGauge
            costBasis={position.averagePrice}
            marketValue={quote?.price ?? null}
            fairValue={fairValue}
            size="row"
            domain={domain}
            label={`${position.ticker}: mercado ${signedPercent(profitPercent)} sobre o custo`}
          />
        </span>

        <span className="position-figure">
          {money(quote?.price, currency)}
          <small>preço atual</small>
        </span>

        <span className={`position-figure ${signClass(profitPercent)}`}>
          {signedPercent(profitPercent)}
          <small>resultado</small>
        </span>

        <motion.span
          className="position-chevron"
          animate={{ rotate: open ? 90 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2.5 L8 6 L4 9.5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={detailId}
            className="position-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    height: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
                    opacity: { duration: 0.22, delay: open ? 0.08 : 0 },
                  }
            }
          >
            <dl className="position-detail-inner">
              <div className="detail-cell">
                <dt>Tipo</dt>
                <dd>
                  <span className="badge">{ASSET_TYPE_LABELS[position.type]}</span>
                </dd>
              </div>
              <div className="detail-cell">
                <dt>Quantidade</dt>
                <dd>{position.quantity}</dd>
              </div>
              <div className="detail-cell">
                <dt>Preço médio</dt>
                <dd>{money(position.averagePrice, currency)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Investido</dt>
                <dd>{money(invested, currency)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Valor atual</dt>
                <dd>{money(currentValue, currency)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Resultado</dt>
                <dd className={signClass(profit)}>{money(profit, currency)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Valor justo</dt>
                <dd className="is-value">{money(fairValue, currency)}</dd>
              </div>
              <div className="detail-cell">
                <dt>Margem de segurança</dt>
                <dd className={`is-value ${signClass(safetyMargin)}`}>
                  {safetyMargin == null
                    ? '—'
                    : `${safetyMargin > 0 ? '+' : ''}${(safetyMargin * 100).toFixed(1)}%`}
                </dd>
              </div>
              <div className="detail-cell">
                <dt>Compra</dt>
                <dd>{formatDate(position.acquiredAt)}</dd>
              </div>
              <div className="detail-cell position-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => onRemove(position.id)}
                >
                  Remover posição
                </button>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

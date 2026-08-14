import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { ScreenedAsset } from '../../../../application/screener/screen-watchlist'
import { useScreener } from '../../../hooks/useScreener'
import { buildSharedScale } from '../../instrument/scale'
import ScreenedCard from './ScreenedCard'
import TickerPicker from './TickerPicker'

type TabKey = 'barato' | 'caro' | 'justo' | 'sem-dados'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'barato', label: 'Baratos' },
  { key: 'justo', label: 'Justos' },
  { key: 'caro', label: 'Caros' },
  { key: 'sem-dados', label: 'Pendentes' },
]

export default function ScreenerPage() {
  const { result, loading, error, refresh, addToWatchlist, removeItem } = useScreener()
  const [tab, setTab] = useState<TabKey>('barato')
  const [pickerOpen, setPickerOpen] = useState(false)
  const reduce = useReducedMotion()

  const buckets: Record<TabKey, ScreenedAsset[]> = {
    barato: result?.cheap ?? [],
    justo: result?.fair ?? [],
    caro: result?.expensive ?? [],
    'sem-dados': result?.unrated ?? [],
  }

  const total = TABS.reduce((sum, t) => sum + buckets[t.key].length, 0)
  const visible = buckets[tab]

  // Régua única para todos os cartões, senão um desconto de 5% desenharia a
  // mesma barra que um de 40% e a comparação entre ativos se perderia.
  const domain = useMemo(
    () =>
      buildSharedScale(
        Object.values(buckets)
          .flat()
          .flatMap((asset) =>
            asset.fairValue != null && asset.fairValue > 0 && asset.price != null
              ? [(asset.price / asset.fairValue - 1) * 100]
              : [],
          ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  )

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1 className="page-title">Barato ou caro</h1>
        <button className="button button-ghost" type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Lendo…' : 'Atualizar'}
        </button>
      </header>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="button button-ghost" type="button" onClick={refresh}>
            Tentar novamente
          </button>
        </div>
      )}

      {result != null && result.missingPrices.length > 0 && (
        <div className="alert alert-warning">
          <strong>Sem cotação no catálogo</strong>
          <ul className="alert-list">
            {result.missingPrices.map((ticker) => (
              <li key={ticker}>
                <code>{ticker}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="segmented segmented-tabs" role="tablist" aria-label="Classificação">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={tab === option.key}
            className={`segment is-${option.key}${tab === option.key ? ' is-active' : ''}`}
            onClick={() => setTab(option.key)}
          >
            {option.label}
            <b>{buckets[option.key].length}</b>
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="ledger">
          <div className="empty-invite">
            <h3>Nada em observação</h3>
            <p>
              Busque uma ação ou FII no catálogo da B3 e informe os fundamentos. A cotação vem da
              brapi; a régua é Graham para ações e P/VP para FIIs.
            </p>
            <button className="button" type="button" onClick={() => setPickerOpen(true)}>
              Adicionar ativo
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="ledger">
          <div className="empty-invite">
            <h3>Nenhum ativo aqui</h3>
            <p>
              Os {total} ativos em observação estão em outras faixas. Barato é margem acima de 20%;
              caro, abaixo de −20%.
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          className="screened-grid"
          key={tab}
          initial={reduce ? undefined : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          {visible.map((asset) => (
            <ScreenedCard
              key={asset.item.id}
              asset={asset}
              domain={domain}
              onRemove={(id) => void removeItem(id)}
            />
          ))}
        </motion.div>
      )}

      <p className="quote-note">
        Preços do catálogo da{' '}
        <a href="https://brapi.dev" target="_blank" rel="noreferrer">
          brapi
        </a>{' '}
        — uma requisição precifica a lista inteira. Fundamentos são informados por você: o plano da
        API não devolve LPA nem VP, e nada aqui é estimado. Isto não é recomendação de investimento.
      </p>

      {/* Botão flutuante: alcance do polegar no celular. */}
      {total > 0 && (
        <button
          className="fab"
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Adicionar ativo à triagem"
        >
          +
        </button>
      )}

      <AnimatePresence>
        {pickerOpen && (
          <>
            <motion.div
              className="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setPickerOpen(false)}
            />
            <motion.div
              className="sheet-holder"
              initial={reduce ? undefined : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduce ? undefined : { y: '100%' }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            >
              <TickerPicker onAdd={addToWatchlist} onClose={() => setPickerOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

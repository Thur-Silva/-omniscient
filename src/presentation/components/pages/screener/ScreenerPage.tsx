import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { ScreenedAsset } from '../../../../application/screener/screen-watchlist'
import type { UniverseAsset } from '../../../../domain/asset/universe'
import { useScreener } from '../../../hooks/useScreener'
import { buildSharedScale } from '../../instrument/scale'
import MarketList from './MarketList'
import ScreenedCard from './ScreenedCard'
import TickerPicker from './TickerPicker'

type TabKey = 'mercado' | 'barato' | 'justo' | 'caro' | 'sem-dados'

const VERDICT_TABS: { key: Exclude<TabKey, 'mercado'>; label: string }[] = [
  { key: 'barato', label: 'Baratos' },
  { key: 'justo', label: 'Justos' },
  { key: 'caro', label: 'Caros' },
  { key: 'sem-dados', label: 'Pendentes' },
]

export default function ScreenerPage() {
  const { result, loading, error, refresh, addToWatchlist, removeItem } = useScreener()
  const [tab, setTab] = useState<TabKey>('mercado')
  const [picking, setPicking] = useState<UniverseAsset | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const reduce = useReducedMotion()

  const buckets = useMemo(
    () => ({
      barato: result?.cheap ?? [],
      justo: result?.fair ?? [],
      caro: result?.expensive ?? [],
      'sem-dados': result?.unrated ?? [],
    }),
    [result],
  )

  const classified = VERDICT_TABS.reduce((sum, t) => sum + buckets[t.key].length, 0)

  const watched = useMemo(
    () =>
      new Set(
        Object.values(buckets)
          .flat()
          .map((asset: ScreenedAsset) => asset.item.ticker),
      ),
    [buckets],
  )

  // Depois de adicionar, leva o usuário até a faixa onde o ativo caiu, em vez de
  // deixá-lo procurar em qual aba o resultado foi parar.
  useEffect(() => {
    if (lastAdded == null || result == null) return
    const found = (Object.entries(buckets) as [Exclude<TabKey, 'mercado'>, ScreenedAsset[]][]).find(
      ([, assets]) => assets.some((asset) => asset.item.ticker === lastAdded),
    )
    if (found) setTab(found[0])
    setLastAdded(null)
  }, [lastAdded, result, buckets])

  // Régua única para todos os cartões, senão um desconto de 5% desenharia a
  // mesma barra que um de 40% e a comparação entre ativos se perderia.
  const domain = useMemo(
    () =>
      buildSharedScale(
        Object.values(buckets)
          .flat()
          .flatMap((asset: ScreenedAsset) =>
            asset.fairValue != null && asset.fairValue > 0 && asset.price != null
              ? [(asset.price / asset.fairValue - 1) * 100]
              : [],
          ),
      ),
    [buckets],
  )

  function openPicker(asset: UniverseAsset | null) {
    setPicking(asset)
    setPickerOpen(true)
  }

  const visible = tab === 'mercado' ? [] : buckets[tab]

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

      <div className="segmented segmented-tabs" role="tablist" aria-label="Visão">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mercado'}
          className={`segment${tab === 'mercado' ? ' is-active' : ''}`}
          onClick={() => setTab('mercado')}
        >
          Mercado
        </button>
        {VERDICT_TABS.map((option) => (
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

      {tab === 'mercado' ? (
        <MarketList watched={watched} onPick={openPicker} />
      ) : visible.length === 0 ? (
        <div className="ledger">
          <div className="empty-invite">
            <h3>{classified === 0 ? 'Nada classificado ainda' : 'Nenhum ativo nesta faixa'}</h3>
            <p>
              {classified === 0
                ? 'Abra Mercado, escolha uma ação ou FII e informe os fundamentos. A cotação vem da brapi; a régua é Graham para ações e P/VP para FIIs.'
                : `Os ${classified} ativos classificados estão em outras faixas. Barato é margem acima de 20%; caro, abaixo de −20%.`}
            </p>
            {classified === 0 && (
              <button className="button" type="button" onClick={() => setTab('mercado')}>
                Ver mercado
              </button>
            )}
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

      {/* Flutuante só fora do Mercado: lá cada linha já tem o próprio "+", e o
          botão cobria justamente a coluna de ação das linhas. */}
      {tab !== 'mercado' && (
        <button
          className="fab"
          type="button"
          onClick={() => openPicker(null)}
          aria-label="Buscar ativo para adicionar à triagem"
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
              <TickerPicker
                preselected={picking}
                onAdd={async (item) => {
                  await addToWatchlist(item)
                  setLastAdded(item.ticker.trim().toUpperCase())
                }}
                onClose={() => setPickerOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

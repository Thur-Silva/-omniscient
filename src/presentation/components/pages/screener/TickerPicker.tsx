import { useState } from 'react'
import {
  ASSET_TYPE_LABELS,
  type AssetType,
} from '../../../../domain/asset/type'
import type { UniverseAsset } from '../../../../domain/asset/universe'
import { usesPriceToBook, type NewWatchlistItem } from '../../../../domain/watchlist/item'
import { useTickerSearch } from '../../../hooks/useTickerSearch'

interface TickerPickerProps {
  onAdd: (item: NewWatchlistItem) => Promise<void>
  onClose: () => void
}

const FILTERS: { label: string; type?: AssetType }[] = [
  { label: 'Tudo' },
  { label: 'Ações', type: 'stock' },
  { label: 'FIIs', type: 'fii' },
  { label: 'BDRs', type: 'bdr' },
]

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export default function TickerPicker({ onAdd, onClose }: TickerPickerProps) {
  const [term, setTerm] = useState('')
  const [filter, setFilter] = useState<AssetType | undefined>(undefined)
  const [picked, setPicked] = useState<UniverseAsset | null>(null)
  const [eps, setEps] = useState('')
  const [growth, setGrowth] = useState('')
  const [book, setBook] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { results, loading, error: searchError } = useTickerSearch(term, filter)

  const byBook = picked ? usesPriceToBook(picked.type) : false

  async function handleSave() {
    if (!picked) return
    setError(null)

    const item: NewWatchlistItem = { ticker: picked.ticker, name: picked.name, type: picked.type }

    if (byBook) {
      const value = Number(book)
      if (book !== '' && (!Number.isFinite(value) || value <= 0)) {
        return setError('O VP por cota precisa ser maior que zero.')
      }
      if (book !== '') item.bookValuePerShare = value
    } else {
      const epsValue = Number(eps)
      const growthValue = Number(growth)
      const filledOne = eps !== '' || growth !== ''
      if (filledOne && (eps === '' || growth === '')) {
        return setError('Graham precisa de LPA e crescimento juntos.')
      }
      if (eps !== '') {
        if (!Number.isFinite(epsValue) || epsValue <= 0) return setError('O LPA precisa ser positivo.')
        if (!Number.isFinite(growthValue) || growthValue < 0 || growthValue > 50) {
          return setError('O crescimento precisa ficar entre 0 e 50.')
        }
        item.earningsPerShare = epsValue
        item.growthPercent = growthValue
      }
    }

    setSaving(true)
    try {
      await onAdd(item)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Adicionar ativo à triagem">
      <div className="sheet-grip" aria-hidden="true" />

      <div className="sheet-head">
        <h2 className="section-title">Adicionar ativo</h2>
        <button className="button button-quiet" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>

      {picked == null ? (
        <>
          <label className="field">
            <span>Buscar no catálogo da B3</span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="WEGE3, Vale, HGLG…"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </label>

          <div className="segmented" role="tablist" aria-label="Filtrar por tipo">
            {FILTERS.map((option) => (
              <button
                key={option.label}
                type="button"
                role="tab"
                aria-selected={filter === option.type}
                className={`segment${filter === option.type ? ' is-active' : ''}`}
                onClick={() => setFilter(option.type)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {searchError && <p className="alert alert-error">{searchError}</p>}

          <div className="picker-results">
            {term.trim().length < 2 ? (
              <p className="muted picker-hint">Digite ao menos duas letras do ticker ou do nome.</p>
            ) : loading ? (
              <p className="muted picker-hint">Buscando…</p>
            ) : results.length === 0 ? (
              <p className="muted picker-hint">Nenhum ativo encontrado.</p>
            ) : (
              results.map((asset) => (
                <button
                  key={asset.ticker}
                  type="button"
                  className="picker-row"
                  onClick={() => setPicked(asset)}
                >
                  <span className="picker-identity">
                    <strong className="ticker">{asset.ticker}</strong>
                    <span>{asset.name}</span>
                  </span>
                  <span className="picker-meta">
                    <span className="price">{asset.price == null ? '—' : brl.format(asset.price)}</span>
                    <span className="badge">{ASSET_TYPE_LABELS[asset.type]}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="picked">
            <span className="picker-identity">
              <strong className="ticker">{picked.ticker}</strong>
              <span>{picked.name}</span>
            </span>
            <button className="button button-ghost" type="button" onClick={() => setPicked(null)}>
              Trocar
            </button>
          </div>

          <p className="muted picker-hint">
            {byBook
              ? 'FII é avaliado por P/VP. Informe o valor patrimonial por cota para o ativo entrar na triagem.'
              : 'Ação é avaliada por Graham. Informe LPA e crescimento para o ativo entrar na triagem.'}{' '}
            A brapi não fornece fundamentos neste plano.
          </p>

          <div className="form-grid">
            {byBook ? (
              <label className="field">
                <span>VP por cota</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={book}
                  onChange={(e) => setBook(e.target.value)}
                  autoFocus
                />
                <span className="field-hint">Patrimônio líquido dividido pelo número de cotas.</span>
              </label>
            ) : (
              <>
                <label className="field">
                  <span>LPA</span>
                  <input
                    type="number"
                    step="any"
                    value={eps}
                    onChange={(e) => setEps(e.target.value)}
                    autoFocus
                  />
                  <span className="field-hint">Lucro por ação dos últimos 12 meses.</span>
                </label>
                <label className="field">
                  <span>Crescimento</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="50"
                    value={growth}
                    onChange={(e) => setGrowth(e.target.value)}
                  />
                  <span className="field-hint">Percentual anual, de 0 a 50.</span>
                </label>
              </>
            )}
          </div>

          {error && <p className="alert alert-error">{error}</p>}

          <button className="button button-block" type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Adicionar à triagem'}
          </button>
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { ASSET_TYPE_LABELS, type AssetType } from '../../../../domain/asset/type'
import type { UniverseAsset } from '../../../../domain/asset/universe'
import { useMarketBrowse } from '../../../hooks/useMarketBrowse'

interface MarketListProps {
  /** Tickers já em observação, para não oferecer duas vezes. */
  watched: Set<string>
  onPick: (asset: UniverseAsset) => void
}

const FILTERS: { label: string; type?: AssetType }[] = [
  { label: 'Ações', type: 'stock' },
  { label: 'FIIs', type: 'fii' },
  { label: 'BDRs', type: 'bdr' },
  { label: 'Tudo' },
]

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export default function MarketList({ watched, onPick }: MarketListProps) {
  const [type, setType] = useState<AssetType | undefined>('stock')
  const [term, setTerm] = useState('')
  const { assets, loading, error } = useMarketBrowse(type, term)

  return (
    <div className="market">
      <label className="field">
        <span>Buscar no catálogo da B3</span>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="WEGE3, Vale, HGLG…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="segmented" role="tablist" aria-label="Filtrar por tipo">
        {FILTERS.map((option) => (
          <button
            key={option.label}
            type="button"
            role="tab"
            aria-selected={type === option.type}
            className={`segment${type === option.type ? ' is-active' : ''}`}
            onClick={() => setType(option.type)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      {loading ? (
        <p className="muted picker-hint">Lendo o catálogo…</p>
      ) : assets.length === 0 ? (
        <p className="muted picker-hint">Nenhum ativo encontrado para esse filtro.</p>
      ) : (
        <ul className="market-rows">
          {assets.map((asset) => {
            const already = watched.has(asset.ticker)
            const up = (asset.changePercent ?? 0) >= 0
            return (
              <li key={asset.ticker}>
                <button
                  type="button"
                  className="market-row"
                  onClick={() => onPick(asset)}
                  aria-label={`${already ? 'Editar' : 'Adicionar'} ${asset.ticker}`}
                >
                  <span className="picker-identity">
                    <strong className="ticker">{asset.ticker}</strong>
                    <span>{asset.name}</span>
                  </span>

                  <span className="market-figures">
                    <span className="price">{asset.price == null ? '—' : brl.format(asset.price)}</span>
                    <small className={asset.changePercent == null ? '' : up ? 'positive' : 'negative'}>
                      {asset.changePercent == null
                        ? '—'
                        : `${up ? '+' : ''}${asset.changePercent.toFixed(2)}%`}
                    </small>
                  </span>

                  <span className={`market-action${already ? ' is-watched' : ''}`} aria-hidden="true">
                    {already ? '✓' : '+'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="quote-note">
        {assets.length} {assets.length === 1 ? 'ativo' : 'ativos'} do catálogo
        {type == null ? '' : ` · ${ASSET_TYPE_LABELS[type]}`}. Toque num ativo para informar os
        fundamentos e ele entra na classificação.
      </p>
    </div>
  )
}

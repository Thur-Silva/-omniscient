import type { ScreenedAsset } from '../../../../application/screener/screen-watchlist'
import { ASSET_TYPE_LABELS } from '../../../../domain/asset/type'
import SafetyGauge from '../../instrument/SafetyGauge'
import type { Scale } from '../../instrument/scale'

interface ScreenedCardProps {
  asset: ScreenedAsset
  domain?: Scale
  onRemove: (id: string) => void
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const VERDICT_LABEL: Record<ScreenedAsset['verdict'], string> = {
  barato: 'Barato',
  justo: 'Justo',
  caro: 'Caro',
  'sem-dados': 'Sem dados',
}

function money(value: number | null): string {
  return value == null ? '—' : brl.format(value)
}

export default function ScreenedCard({ asset, domain, onRemove }: ScreenedCardProps) {
  const { item, price, fairValue, safetyMargin, priceToBook, verdict, method, missing } = asset
  const marginPercent = safetyMargin == null ? null : safetyMargin * 100

  return (
    <article className={`screened is-${verdict}`}>
      <header className="screened-head">
        <span className="picker-identity">
          <strong className="ticker">{item.ticker}</strong>
          <span>{item.name ?? asset.sector ?? ASSET_TYPE_LABELS[item.type]}</span>
        </span>
        <span className={`verdict-chip is-${verdict}`}>{VERDICT_LABEL[verdict]}</span>
      </header>

      {verdict === 'sem-dados' ? (
        <p className="screened-missing">{missing ?? 'Faltam dados para avaliar.'}</p>
      ) : (
        <>
          <div className="screened-readout">
            <span className="screened-margin">
              {marginPercent == null
                ? '—'
                : `${marginPercent > 0 ? '+' : ''}${marginPercent.toFixed(1)}%`}
            </span>
            <span className="screened-figures">
              <span className="price">{money(price)}</span>
              <small>justo {money(fairValue)}</small>
            </span>
          </div>

          {/* Datum no valor justo: o ponteiro mostra onde o preço está em relação
              a ele, que é a leitura que a triagem pede. */}
          <SafetyGauge
            costBasis={fairValue ?? 0}
            marketValue={price}
            size="row"
            polarity="discount"
            domain={domain}
            label={`${item.ticker}: preço ${
              marginPercent == null ? 'sem leitura' : `${marginPercent.toFixed(1)}% do valor justo`
            }`}
          />
        </>
      )}

      <footer className="screened-foot">
        <span className="screened-method">
          {method === 'p/vp'
            ? `P/VP ${priceToBook == null ? '—' : priceToBook.toFixed(2)}`
            : method === 'graham'
              ? `Graham · LPA ${item.earningsPerShare?.toFixed(2) ?? '—'} · cresc. ${item.growthPercent ?? '—'}%`
              : ASSET_TYPE_LABELS[item.type]}
        </span>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remover ${item.ticker} da triagem`}
        >
          Remover
        </button>
      </footer>
    </article>
  )
}

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { ASSET_TYPE_LABELS, type AssetType, type Currency } from '../../../../domain/asset/type'
import { usePortfolio } from '../../../hooks/usePortfolio'
import AnimatedNumber from '../../instrument/AnimatedNumber'
import SafetyGauge from '../../instrument/SafetyGauge'
import { buildSharedScale } from '../../instrument/scale'
import AddPositionForm from './AddPositionForm'
import PositionRow from './PositionRow'

const formatters: Record<Currency, Intl.NumberFormat> = {
  BRL: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  USD: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }),
}

function money(value: number | null | undefined, currency: Currency = 'BRL'): string {
  return value == null ? '—' : formatters[currency].format(value)
}

function signClass(value: number | null | undefined): string {
  if (value == null) return ''
  return value >= 0 ? 'positive' : 'negative'
}

/** Sequência de entrada: o painel se acende de cima para baixo. */
const panel = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

const rise = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
}

export default function AssetsPage() {
  const { view, loading, error, refresh, addPosition, removePosition } = usePortfolio()
  const [formOpen, setFormOpen] = useState(false)
  const reduce = useReducedMotion()

  const rows = view?.rows ?? []
  const portfolio = view?.portfolio
  const totalInvested = portfolio?.totalInvested ?? 0
  const totalValue = portfolio?.totalCurrentValue ?? null
  const totalProfit = portfolio?.totalProfit ?? null
  const totalProfitPercent = portfolio?.totalProfitPercent ?? null
  const allocation = portfolio?.allocationByType() ?? {}

  const allocationEntries = (Object.entries(allocation) as [AssetType, number][]).sort(
    (a, b) => b[1] - a[1],
  )

  // Só agrega valor justo se TODAS as posições tiverem valuation. Somar um
  // subconjunto daria uma margem de segurança que não significa nada.
  const valued = rows.filter((row) => row.fairValue != null && row.quote != null)
  const allValued = rows.length > 0 && valued.length === rows.length
  const portfolioFairValue = allValued
    ? valued.reduce((sum, row) => sum + (row.fairValue ?? 0) * row.position.quantity, 0)
    : null

  const hasPositions = rows.length > 0
  const showForm = formOpen || (!hasPositions && !loading)

  // Uma régua para todas as linhas: os instrumentos ficam empilhados e só são
  // comparáveis se compartilharem a escala. O datum também alinha na coluna.
  const rowDomain = buildSharedScale(
    rows.flatMap((row) => {
      const cost = row.position.averagePrice
      if (cost <= 0) return []
      const deviations = [((row.quote?.price ?? cost) / cost - 1) * 100]
      if (row.fairValue != null) deviations.push((row.fairValue / cost - 1) * 100)
      return deviations
    }),
  )

  return (
    <motion.div
      className="page stack-xl"
      variants={reduce ? undefined : panel}
      initial="hidden"
      animate="shown"
    >
      {error && (
        <motion.div className="alert alert-error" variants={reduce ? undefined : rise}>
          <span>{error}</span>
          <button className="button button-ghost" type="button" onClick={refresh}>
            Tentar novamente
          </button>
        </motion.div>
      )}

      {/* ── O instrumento ───────────────────────────────────────────────── */}
      <motion.section className="instrument" variants={reduce ? undefined : rise}>
        <div className="instrument-head">
          <span className="eyebrow">Carteira</span>
          <span className="header-date">
            {loading
              ? 'lendo cotações…'
              : view?.lastUpdatedAt != null
                ? `apurado ${new Date(view.lastUpdatedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'sem leitura'}
          </span>
        </div>

        <div className="instrument-readout">
          <div className="verdict">
            <span className={`verdict-figure ${signClass(totalProfitPercent)}`}>
              {totalProfitPercent == null ? (
                '—'
              ) : (
                <AnimatedNumber
                  value={totalProfitPercent}
                  format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
                  delay={0.2}
                />
              )}
            </span>
            <span className="verdict-label">sobre o custo da carteira</span>

            {/* O instrumento mora na coluna do veredicto: preenche o vazio sob a
                figura e ganha proporção de mostrador em vez de esticar 1000px. */}
            <div className="verdict-instrument">
              <SafetyGauge
                costBasis={totalInvested}
                marketValue={totalValue}
                fairValue={portfolioFairValue}
                size="hero"
                label={`Carteira: mercado ${totalProfitPercent?.toFixed(2) ?? '—'}% sobre o custo`}
              />
            </div>

            <span className="verdict-note">
              {!hasPositions
                ? 'O instrumento está calibrado e aguardando a primeira posição.'
                : allValued
                  ? 'Todas as posições têm valuation, então a margem de segurança agregada é comparável.'
                  : `${valued.length} de ${rows.length} ${rows.length === 1 ? 'posição tem' : 'posições têm'} LPA e crescimento informados. A margem agregada aparece quando todas tiverem.`}
            </span>
          </div>

          <div className="tally">
            <div className="tally-row">
              <span className="tally-value">
                {totalValue == null ? (
                  '—'
                ) : (
                  <AnimatedNumber value={totalValue} format={(v) => money(v)} delay={0.26} />
                )}
              </span>
              <span className="tally-label">Valor de mercado</span>
            </div>
            <div className="tally-row">
              <span className="tally-value">
                <AnimatedNumber value={totalInvested} format={(v) => money(v)} delay={0.32} />
              </span>
              <span className="tally-label">Custo total</span>
            </div>
            <div className="tally-row">
              <span className={`tally-value ${signClass(totalProfit)}`}>
                {totalProfit == null ? (
                  '—'
                ) : (
                  <AnimatedNumber
                    value={totalProfit}
                    format={(v) => `${v > 0 ? '+' : ''}${money(v)}`}
                    delay={0.38}
                  />
                )}
              </span>
              <span className="tally-label">Resultado</span>
            </div>

            {allocationEntries.length > 0 && (
              <div className="allocation-strip">
                <span className="eyebrow">Alocação</span>
                <div className="allocation-bar">
                  {allocationEntries.map(([type, pct]) => (
                    <div
                      key={type}
                      className="allocation-segment"
                      style={{ width: `${pct}%` }}
                      title={`${ASSET_TYPE_LABELS[type]} ${pct.toFixed(1)}%`}
                    />
                  ))}
                </div>
                <div className="allocation-legend">
                  {allocationEntries.map(([type, pct]) => (
                    <span key={type} className="allocation-key">
                      <i />
                      {ASSET_TYPE_LABELS[type]} <b>{pct.toFixed(1)}%</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {/* ── Posições ────────────────────────────────────────────────────── */}
      <motion.section variants={reduce ? undefined : rise}>
        <div className="section-head">
          <h2 className="section-title">Posições</h2>
          <div className="section-actions">
            <span className="section-count">
              {loading ? '···' : `${rows.length} ${rows.length === 1 ? 'ativo' : 'ativos'}`}
            </span>
            <button className="button button-ghost" type="button" onClick={refresh} disabled={loading}>
              Atualizar cotações
            </button>
            {hasPositions && (
              <button
                className="button"
                type="button"
                onClick={() => setFormOpen((value) => !value)}
                aria-expanded={formOpen}
              >
                {formOpen ? 'Fechar' : 'Adicionar posição'}
              </button>
            )}
          </div>
        </div>

        {view != null && view.quoteErrors.length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: 18 }}>
            <strong>Algumas cotações não foram lidas</strong>
            <ul className="alert-list">
              {view.quoteErrors.map((quoteError) => (
                <li key={quoteError.ticker}>
                  <code>{quoteError.ticker}</code> — {quoteError.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="ledger">
          {!hasPositions ? (
            <div className="empty-invite">
              <h3>Nada medido ainda</h3>
              <p>
                Cadastre um ativo com quantidade e preço médio. A cotação vem da brapi; informe LPA
                e crescimento para o instrumento também calcular a margem de segurança.
              </p>
            </div>
          ) : (
            rows.map((row) => (
              <PositionRow
                key={row.position.id}
                row={row}
                money={money}
                domain={rowDomain}
                onRemove={(id) => void removePosition(id)}
              />
            ))
          )}
        </div>
      </motion.section>

      {/* ── Cadastro ────────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {showForm && (
          <motion.div
            initial={reduce ? undefined : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <AddPositionForm
              onSubmit={async (position) => {
                await addPosition(position)
                setFormOpen(false)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.footer className="quote-note" variants={reduce ? undefined : rise}>
        Cotações fornecidas pela{' '}
        <a href="https://brapi.dev" target="_blank" rel="noreferrer">
          brapi
        </a>
        . Valor justo pelo modelo de Graham, calculado apenas para posições com LPA e crescimento
        informados — nada é presumido.
      </motion.footer>
    </motion.div>
  )
}

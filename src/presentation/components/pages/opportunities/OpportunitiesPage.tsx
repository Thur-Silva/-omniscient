import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  FII_CATEGORIES,
  FII_CATEGORY_LABELS,
  type FiiCategory,
} from '../../../../domain/fii/fundamentals'
import { CRITERIA, type RejectionReason } from '../../../../domain/fii/ranking'
import { useFiiOpportunities } from '../../../hooks/useFiiOpportunities'
import OpportunityRow from './OpportunityRow'

type SortKey = 'colocacao' | 'liquidez'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'colocacao', label: 'Colocação' },
  { key: 'liquidez', label: 'Maior liquidez' },
]

const REASON_LABELS: Record<RejectionReason, string> = {
  'liquidez-baixa': 'liquidez abaixo de R$ 1M/dia',
  'sem-dados': 'sem DY, P/VP ou liquidez na fonte',
  'pvp-fora-da-faixa': 'P/VP fora de 0,80–1,05',
  'dy-acima-do-teto': 'DY acima de 16% a.a.',
  'dy-nulo': 'sem distribuição',
}

const integer = new Intl.NumberFormat('pt-BR')

export default function OpportunitiesPage() {
  const { report, loading, error, refresh } = useFiiOpportunities()
  const reduce = useReducedMotion()
  const [categories, setCategories] = useState<Set<FiiCategory>>(new Set())
  const [sort, setSort] = useState<SortKey>('colocacao')

  // Estável entre renders: com `report?.ranked ?? []` solto, o array vazio seria
  // novo a cada render e os useMemo abaixo recalculariam sempre.
  const ranked = useMemo(() => report?.ranked ?? [], [report])

  const countByCategory = useMemo(() => {
    const counts = new Map<FiiCategory, number>()
    for (const entry of ranked) {
      counts.set(entry.fundamentals.category, (counts.get(entry.fundamentals.category) ?? 0) + 1)
    }
    return counts
  }, [ranked])

  /**
   * Filtro e ordenação acontecem depois do ranking, nunca dentro dele: a
   * colocação exibida continua sendo a do ranking geral, então dá para ver que um
   * fundo de tijolo é o 7º no todo mesmo olhando só tijolo.
   */
  const visible = useMemo(() => {
    const filtered =
      categories.size === 0
        ? ranked
        : ranked.filter((entry) => categories.has(entry.fundamentals.category))

    if (sort === 'liquidez') {
      return [...filtered].sort(
        (a, b) =>
          (b.fundamentals.averageDailyLiquidity ?? 0) - (a.fundamentals.averageDailyLiquidity ?? 0),
      )
    }
    return filtered
  }, [ranked, categories, sort])

  function toggleCategory(category: FiiCategory) {
    setCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1 className="page-title">Oportunidades</h1>
        <button className="button button-ghost" type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Apurando…' : 'Atualizar'}
        </button>
      </header>

      {/* Os critérios ficam à vista: o ranking não deve ser uma caixa preta. */}
      <div className="criteria">
        <span className="criteria-item">
          liquidez ≥ R$ {integer.format(CRITERIA.minDailyLiquidity / 1_000_000)}M/dia
        </span>
        <span className="criteria-item">DY ≤ {CRITERIA.maxDividendYield}% a.a.</span>
        <span className="criteria-item">
          P/VP entre {CRITERIA.minPriceToBook.toFixed(2).replace('.', ',')} e{' '}
          {CRITERIA.maxPriceToBook.toFixed(2).replace('.', ',')}
        </span>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="button button-ghost" type="button" onClick={refresh}>
            Tentar novamente
          </button>
        </div>
      )}

      {loading && report == null ? (
        <div className="ledger">
          <div className="empty-invite">
            <h3>Apurando o mercado</h3>
            <p>Lendo DY, P/VP e liquidez de todos os FIIs listados.</p>
          </div>
        </div>
      ) : ranked.length === 0 && !error ? (
        <div className="ledger">
          <div className="empty-invite">
            <h3>Nenhum FII passou nos critérios</h3>
            <p>
              Nenhum dos {integer.format(report?.universeSize ?? 0)} fundos analisados atende aos
              três filtros ao mesmo tempo. Isso acontece quando o mercado está caro.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Organizam a lista já ranqueada; não mexem na elegibilidade nem na soma. */}
          <div className="filters">
            <div className="filter-group">
              <span className="filter-label">Categoria</span>
              <div className="chips" role="group" aria-label="Filtrar por categoria">
                {FII_CATEGORIES.map((category) => {
                  const count = countByCategory.get(category) ?? 0
                  const active = categories.has(category)
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={active}
                      disabled={count === 0}
                      className={`chip${active ? ' is-active' : ''}`}
                      onClick={() => toggleCategory(category)}
                    >
                      {FII_CATEGORY_LABELS[category]}
                      <b>{count}</b>
                    </button>
                  )
                })}
                {categories.size > 0 && (
                  <button
                    type="button"
                    className="chip chip-clear"
                    onClick={() => setCategories(new Set())}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Ordenar por</span>
              <div className="chips" role="group" aria-label="Ordenação">
                {SORTS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={sort === option.key}
                    className={`chip${sort === option.key ? ' is-active' : ''}`}
                    onClick={() => setSort(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rank-head">
            <span className="eyebrow">
              {visible.length === ranked.length
                ? `${ranked.length} ${ranked.length === 1 ? 'fundo aprovado' : 'fundos aprovados'} de ${integer.format(report?.universeSize ?? 0)}`
                : `${visible.length} de ${ranked.length} aprovados`}
            </span>
            <span className="rank-legend">
              soma = colocação DY + colocação P/VP · menor é melhor · o número é a colocação geral
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="ledger">
              <div className="empty-invite">
                <h3>Nenhum fundo nessa categoria</h3>
                <p>Os {ranked.length} aprovados estão em outras categorias.</p>
              </div>
            </div>
          ) : (
            <motion.div
              className="ledger"
              key={`${[...categories].sort().join('-')}|${sort}`}
              initial={reduce ? undefined : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {visible.map((entry) => (
                <OpportunityRow key={entry.fundamentals.ticker} entry={entry} />
              ))}
            </motion.div>
          )}

          {report != null && (
            <div className="rejected-note">
              <span className="eyebrow">Descartados</span>
              <ul className="rejected-list">
                {(Object.entries(report.rejectedByReason) as [RejectionReason, number][])
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <li key={reason}>
                      <b>{integer.format(count)}</b> {REASON_LABELS[reason]}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="quote-note">
        DY, P/VP, VP por cota e liquidez média diária vêm do StatusInvest, que não publica API
        oficial — a fonte pode mudar ou sair do ar sem aviso. O ranking soma as duas colocações para
        não depender de um índice só. Isto não é recomendação de investimento.
      </p>
    </div>
  )
}

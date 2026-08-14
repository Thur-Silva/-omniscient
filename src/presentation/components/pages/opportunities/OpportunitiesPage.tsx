import { motion, useReducedMotion } from 'motion/react'
import { CRITERIA, type RejectionReason } from '../../../../domain/fii/ranking'
import { useFiiOpportunities } from '../../../hooks/useFiiOpportunities'
import OpportunityRow from './OpportunityRow'

const REASON_LABELS: Record<RejectionReason, string> = {
  'liquidez-baixa': 'liquidez abaixo de R$ 2M/dia',
  'sem-dados': 'sem DY, P/VP ou liquidez na fonte',
  'pvp-fora-da-faixa': 'P/VP fora de 0,80–1,05',
  'dy-acima-do-teto': 'DY acima de 16% a.a.',
  'dy-nulo': 'sem distribuição',
}

const integer = new Intl.NumberFormat('pt-BR')

export default function OpportunitiesPage() {
  const { report, loading, error, refresh } = useFiiOpportunities()
  const reduce = useReducedMotion()

  const ranked = report?.ranked ?? []

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
          <div className="rank-head">
            <span className="eyebrow">
              {ranked.length} {ranked.length === 1 ? 'fundo aprovado' : 'fundos aprovados'} de{' '}
              {integer.format(report?.universeSize ?? 0)}
            </span>
            <span className="rank-legend">soma = colocação DY + colocação P/VP · menor é melhor</span>
          </div>

          <motion.div
            className="ledger"
            initial={reduce ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            {ranked.map((entry) => (
              <OpportunityRow key={entry.fundamentals.ticker} entry={entry} />
            ))}
          </motion.div>

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

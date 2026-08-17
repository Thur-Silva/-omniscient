import type { Pool } from 'pg'
import type {
  CeilingValuation,
  CeilingValuationRepository,
} from '../../../src/domain/valuation/ceiling-valuation'
import type {
  TwoPhaseDcfBreakdown,
  TwoPhaseDcfProjection,
} from '../../../src/domain/valuation/models/two-phase-dcf'

interface CeilingRow {
  id: string
  user_id: string
  ticker: string
  market_price: string | null
  ceiling_price: string
  safety_margin: string | null
  assumptions: unknown
  breakdown: unknown
  created_at: Date
}

/**
 * `numeric` volta do pg como string (o driver não converte para `number`), e
 * `jsonb` volta como objeto já parseado. A conversão mora aqui, na borda.
 */
function toCeilingValuation(row: CeilingRow): CeilingValuation {
  return {
    id: row.id,
    userId: row.user_id,
    ticker: row.ticker,
    marketPrice: row.market_price == null ? null : Number(row.market_price),
    ceilingPrice: Number(row.ceiling_price),
    safetyMargin: row.safety_margin == null ? null : Number(row.safety_margin),
    // Os shapes foram validados na escrita (mesmas interfaces de domínio), então
    // o cast aqui é a confiança de que o que saiu é o que entrou.
    assumptions: row.assumptions as TwoPhaseDcfProjection,
    breakdown: row.breakdown as TwoPhaseDcfBreakdown,
    createdAt: row.created_at.toISOString(),
  }
}

/**
 * Preços teto salvos em `ceiling_valuation`.
 *
 * O que o usuário calculou na tela fica registrado como estava: teto, margem,
 * premissas e memória de cálculo em `jsonb` — auditável depois, mesmo quando a
 * fonte já mudou.
 */
export class PostgresCeilingValuationRepository implements CeilingValuationRepository {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async save(record: Omit<CeilingValuation, 'id' | 'createdAt'>): Promise<CeilingValuation> {
    const { rows } = await this.pool.query<CeilingRow>(
      `insert into ceiling_valuation
         (user_id, ticker, market_price, ceiling_price, safety_margin, assumptions, breakdown, created_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now())
       returning id, user_id, ticker, market_price, ceiling_price, safety_margin,
                 assumptions, breakdown, created_at`,
      [
        record.userId,
        record.ticker,
        record.marketPrice,
        record.ceilingPrice,
        record.safetyMargin,
        JSON.stringify(record.assumptions),
        JSON.stringify(record.breakdown),
      ],
    )
    return toCeilingValuation(rows[0])
  }

  async list(userId: string): Promise<CeilingValuation[]> {
    const { rows } = await this.pool.query<CeilingRow>(
      `select id, user_id, ticker, market_price, ceiling_price, safety_margin,
              assumptions, breakdown, created_at
         from ceiling_valuation
        where user_id = $1
        order by created_at desc`,
      [userId],
    )
    return rows.map(toCeilingValuation)
  }
}
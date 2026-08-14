import type { Pool } from 'pg'
import type { SnapshotRepository } from '../../../src/domain/cache/repository'
import type { DataSnapshot, SourceKey } from '../../../src/domain/cache/snapshot'

interface SnapshotRow {
  source_key: string
  payload: unknown
  upstream_status: number
  byte_size: number
  captured_at: Date
}

function toSnapshot(row: SnapshotRow): DataSnapshot {
  return {
    sourceKey: row.source_key,
    payload: row.payload,
    upstreamStatus: row.upstream_status,
    byteSize: row.byte_size,
    capturedAt: row.captured_at,
  }
}

export class PostgresSnapshotRepository implements SnapshotRepository {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async find(key: SourceKey): Promise<DataSnapshot | null> {
    const { rows } = await this.pool.query<SnapshotRow>(
      'select source_key, payload, upstream_status, byte_size, captured_at from api_snapshot where source_key = $1',
      [key],
    )
    return rows[0] ? toSnapshot(rows[0]) : null
  }

  async save(snapshot: Omit<DataSnapshot, 'capturedAt'>): Promise<DataSnapshot> {
    const { rows } = await this.pool.query<SnapshotRow>(
      `insert into api_snapshot (source_key, payload, upstream_status, byte_size, captured_at)
       values ($1, $2::jsonb, $3, $4, now())
       on conflict (source_key) do update
         set payload         = excluded.payload,
             upstream_status = excluded.upstream_status,
             byte_size       = excluded.byte_size,
             captured_at     = excluded.captured_at
       returning source_key, payload, upstream_status, byte_size, captured_at`,
      [
        snapshot.sourceKey,
        JSON.stringify(snapshot.payload),
        snapshot.upstreamStatus,
        snapshot.byteSize,
      ],
    )
    return toSnapshot(rows[0])
  }
}

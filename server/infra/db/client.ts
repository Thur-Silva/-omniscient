import { Pool } from 'pg'

let pool: Pool | null = null

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      'DATABASE_URL não está definida. O cache de servidor precisa dela para falar com o Neon. ' +
        'Copie a connection string do painel do Neon para o .env.',
    )
    this.name = 'MissingDatabaseUrlError'
  }
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new MissingDatabaseUrlError()
  return url
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

/**
 * Pool único por processo.
 *
 * O Neon encerra conexões ociosas, então o pool fica pequeno e com timeout curto;
 * reconectar é barato e manter conexão aberta sem uso não é.
 */
export function getPool(): Pool {
  if (pool == null) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Neon exige TLS; o certificado é público e verificável.
      ssl: { rejectUnauthorized: true },
    })
    pool.on('error', (error) => {
      console.error('[db] erro no pool ocioso:', error.message)
    })
  }
  return pool
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = null
}

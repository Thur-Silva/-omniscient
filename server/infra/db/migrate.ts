import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closePool, getPool, hasDatabaseUrl } from './client'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

/**
 * Aplica os .sql de /migrations em ordem, uma vez cada.
 *
 * Cada arquivo roda dentro de uma transação junto com o registro em
 * schema_migrations: se o SQL falhar no meio, nada fica pela metade e o arquivo
 * continua pendente.
 */
export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  const pool = getPool()

  await pool.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const { rows } = await pool.query<{ filename: string }>('select filename from schema_migrations')
  const already = new Set(rows.map((row) => row.filename))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  const applied: string[] = []
  const skipped: string[] = []

  for (const filename of files) {
    if (already.has(filename)) {
      skipped.push(filename)
      continue
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (filename) values ($1)', [filename])
      await client.query('commit')
      applied.push(filename)
    } catch (error) {
      await client.query('rollback')
      throw new Error(
        `migration ${filename} falhou: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      client.release()
    }
  }

  return { applied, skipped }
}

// Execução direta: npm run db:migrate
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('server/infra/db/migrate.ts')
if (isDirectRun) {
  if (!hasDatabaseUrl()) {
    console.error('DATABASE_URL não definida. Adicione ao .env e rode de novo.')
    process.exit(1)
  }
  try {
    const { applied, skipped } = await migrate()
    for (const file of skipped) console.log(`  já aplicada  ${file}`)
    for (const file of applied) console.log(`  APLICADA     ${file}`)
    console.log(applied.length === 0 ? '\nnada a fazer, schema em dia' : `\n${applied.length} migration(s) aplicada(s)`)
  } catch (error) {
    console.error('\nfalhou:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await closePool()
  }
}

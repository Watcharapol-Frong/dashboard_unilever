import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query(text, params)
  return rows as T[]
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const { rows } = await pool.query(text, params)
  return (rows[0] as T) ?? null
}

export async function queryCount(text: string, params?: unknown[]): Promise<number> {
  const { rows } = await pool.query(text, params)
  return Number(rows[0]?.count ?? rows[0]?.total ?? 0)
}

import { Pool } from 'pg'

// Strict certificate validation in production; relaxed only for local development
// where self-signed or no TLS may be in use.
const sslConfig = process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: true }
  : { rejectUnauthorized: false }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
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

export async function queryRowCount(text: string, params?: unknown[]): Promise<number> {
  const result = await pool.query(text, params)
  return result.rowCount ?? 0
}

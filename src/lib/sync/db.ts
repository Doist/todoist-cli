import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getSyncSettings } from '../auth.js'
import { runMigrations } from './migrations.js'

type SqlArgs = Array<string | number | boolean | null>

interface SqlStatement {
    sql: string
    args?: SqlArgs
}

interface SqlResult {
    rows: Array<Record<string, unknown>>
}

interface SqlClient {
    execute(statement: string | SqlStatement): Promise<SqlResult>
}

export class CacheDb {
    constructor(private readonly client: SqlClient) {}

    async execute(sql: string, args: SqlArgs = []): Promise<SqlResult> {
        return this.client.execute({ sql, args })
    }

    async query(sql: string, args: SqlArgs = []): Promise<Array<Record<string, unknown>>> {
        const result = await this.client.execute({ sql, args })
        return result.rows.map((row) => ({ ...row }))
    }

    async first(sql: string, args: SqlArgs = []): Promise<Record<string, unknown> | null> {
        const rows = await this.query(sql, args)
        return rows[0] ?? null
    }
}

let cachedPath: string | null = null
let dbPromise: Promise<CacheDb | null> | null = null

async function createDb(dbPath: string): Promise<CacheDb> {
    await mkdir(dirname(dbPath), { recursive: true })
    const libsqlModuleName = '@libsql/client'
    const libsql = (await import(libsqlModuleName)) as {
        createClient: (options: { url: string }) => SqlClient
    }
    const client = libsql.createClient({ url: `file:${dbPath}` })
    await runMigrations(client)
    return new CacheDb(client)
}

export async function getCacheDb(options?: { ignoreEnabled?: boolean }): Promise<CacheDb | null> {
    const sync = await getSyncSettings()
    if (!options?.ignoreEnabled && !sync.enabled) return null

    if (dbPromise && cachedPath === sync.dbPath) {
        return dbPromise
    }

    cachedPath = sync.dbPath
    dbPromise = createDb(sync.dbPath)
    return dbPromise
}

export function resetCacheDbForTests(): void {
    cachedPath = null
    dbPromise = null
}

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const CONFIG_PATH = join(homedir(), '.config', 'todoist-cli', 'config.json')

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'

export interface Config extends Record<string, unknown> {
    api_token?: string
    pendingSecureStoreClear?: boolean
    auth_mode?: AuthMode
    auth_scope?: string
    update_channel?: UpdateChannel
}

export async function readConfig(): Promise<Config> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        const parsed = JSON.parse(content)
        return isObject(parsed) ? (parsed as Config) : {}
    } catch {
        return {}
    }
}

export async function writeConfig(config: Config): Promise<void> {
    if (Object.keys(config).length === 0) {
        try {
            await unlink(CONFIG_PATH)
        } catch (error) {
            if (!isMissingFileError(error)) {
                throw error
            }
        }
        return
    }

    await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 })
    await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: 'utf-8',
        mode: 0o600,
    })
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

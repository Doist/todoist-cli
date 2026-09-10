/**
 * Finding what is installed.
 *
 * Discovery is one `readdir` of the extensions directory plus, for each entry
 * found, a couple of small file reads. It runs on every invocation of the host
 * CLI — including the overwhelmingly common case of no extensions at all,
 * where it costs a single failed directory read — so nothing here may spawn a
 * process or touch the network.
 */

import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { exists } from './fs-utils.js'
import { readAuthoredManifest, readInstalledManifest } from './manifest.js'
import { parseRepoRef, toCommandName } from './source.js'
import { readState } from './state.js'
import type { Extension, ExtensionKind } from './types.js'

export type DiscoverOptions = {
    extensionsDir: string
    stateDir: string
    binName: string
    officialSource: { host: string; owner: string }
}

/**
 * Pull `remote.origin.url` out of `.git/config` rather than shelling out to
 * git, so that listing extensions stays free of subprocesses.
 */
async function readGitRemote(dir: string): Promise<string | undefined> {
    let config: string
    try {
        config = await readFile(join(dir, '.git', 'config'), 'utf8')
    } catch {
        return undefined
    }
    const section = config.match(/\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/)
    if (!section) return undefined
    return section[1].match(/^\s*url\s*=\s*(.+)$/m)?.[1].trim()
}

/**
 * Resolve the directory a local install points at. On POSIX the entry is a
 * symlink; on Windows it is a plain file holding the target path, because
 * creating a symlink there needs elevated rights.
 */
async function resolveLocalTarget(entryPath: string, isLink: boolean): Promise<string | undefined> {
    if (isLink) {
        try {
            return await realpath(entryPath)
        } catch {
            return undefined
        }
    }
    try {
        const target = (await readFile(entryPath, 'utf8')).trim()
        if (!target) return undefined
        return isAbsolute(target) ? target : resolve(target)
    } catch {
        return undefined
    }
}

async function inferKind(entryPath: string, isDirectory: boolean): Promise<ExtensionKind> {
    if (!isDirectory) return 'local'
    if (await exists(join(entryPath, '.git'))) return 'git'
    return 'binary'
}

/**
 * The executable an extension is dispatched through: `<dir>/<dirName>`, with
 * the `.exe` variant preferred on Windows when it is the one that exists.
 */
async function findExecutable(dir: string, dirName: string): Promise<string> {
    const base = join(dir, dirName)
    if (process.platform === 'win32') {
        for (const candidate of [`${base}.exe`, `${base}.cmd`]) {
            if (await exists(candidate)) return candidate
        }
    }
    return base
}

async function describe(entry: string, options: DiscoverOptions): Promise<Extension | undefined> {
    const { extensionsDir, stateDir, binName, officialSource } = options
    const entryPath = join(extensionsDir, entry)

    // `lstat` answers both questions for a regular entry — is it a link, and
    // is it a directory — so discovery costs one call per entry, not two.
    const entryStats = await lstat(entryPath).catch(() => undefined)
    if (!entryStats) return undefined
    const isLink = entryStats.isSymbolicLink()

    const kind = await inferKind(entryPath, entryStats.isDirectory())
    const dir =
        kind === 'local' ? ((await resolveLocalTarget(entryPath, isLink)) ?? entryPath) : entryPath

    const [authored, installed, state] = await Promise.all([
        readAuthoredManifest(dir, binName),
        kind === 'binary' ? readInstalledManifest(dir, binName) : Promise.resolve(undefined),
        readState(stateDir, entry),
    ])

    let host: string | undefined
    let owner: string | undefined
    let source: string | undefined

    if (kind === 'binary' && installed) {
        host = installed.host
        owner = installed.owner
        source = `${installed.owner}/${installed.name}`
    } else if (kind === 'git') {
        const remote = await readGitRemote(dir)
        const parsed = remote ? parseRepoRef(remote) : undefined
        host = parsed?.host
        owner = parsed?.owner
        source = parsed ? `${parsed.owner}/${parsed.repo}` : remote
    } else if (kind === 'local') {
        source = dir
    }

    const official =
        kind !== 'local' && host === officialSource.host && owner === officialSource.owner

    return {
        name: toCommandName(binName, entry),
        dirName: entry,
        kind,
        dir,
        entryPath,
        executablePath: await findExecutable(dir, entry),
        source,
        host,
        owner,
        pinned: Boolean(state.pinned ?? installed?.pinned),
        official,
        description: authored?.description ?? installed?.description,
        requires: authored?.requires ?? installed?.requires,
        manifest: installed,
    }
}

/** Every extension installed for this CLI, sorted by command name. */
export async function discoverExtensions(options: DiscoverOptions): Promise<Extension[]> {
    let entries: string[]
    try {
        entries = await readdir(options.extensionsDir)
    } catch {
        return []
    }

    const prefix = `${options.binName}-`
    const candidates = entries.filter((entry) => entry.startsWith(prefix) && entry !== prefix)
    const described = await Promise.all(candidates.map((entry) => describe(entry, options)))

    return described
        .filter((extension): extension is Extension => extension !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name))
}

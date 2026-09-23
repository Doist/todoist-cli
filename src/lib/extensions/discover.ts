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
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { mapWithConcurrency } from './concurrency.js'
import { exists, isDirectory } from './fs-utils.js'
import { isMissingFile } from './json-file.js'
import { readAuthoredManifest, readInstalledManifest } from './manifest.js'
import { parseRepoRef, toCommandName, toDirName } from './source.js'
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
        // Relative to the path file itself, not to wherever the CLI happens to
        // have been run from, so the install points at one directory always.
        return isAbsolute(target) ? target : resolve(dirname(entryPath), target)
    } catch {
        return undefined
    }
}

async function inferKind(entryPath: string, entryIsDirectory: boolean): Promise<ExtensionKind> {
    if (!entryIsDirectory) return 'local'
    // A directory, not merely a `.git` of some kind: a release binary is free
    // to ship a file by that name, and misreading it as a clone would hide its
    // manifest and its source.
    if (await isDirectory(join(entryPath, '.git'))) return 'git'
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

    // Every per-extension read at once: they are independent, and discovery
    // runs on every invocation of the CLI.
    const [authored, installed, state, remote] = await Promise.all([
        readAuthoredManifest(dir, binName),
        kind === 'binary' ? readInstalledManifest(dir, binName) : Promise.resolve(undefined),
        readState(stateDir, entry),
        kind === 'git' ? readGitRemote(dir) : Promise.resolve(undefined),
    ])

    let host: string | undefined
    let owner: string | undefined
    let source: string | undefined

    if (kind === 'binary' && installed) {
        host = installed.host
        owner = installed.owner
        source = `${installed.owner}/${installed.name}`
    } else if (kind === 'git') {
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
        pinnedRef: state.pinned ?? (installed?.pinned ? installed.tag : undefined),
        official,
        description: authored?.description ?? installed?.description,
        requires: authored?.requires ?? installed?.requires,
        manifest: installed,
    }
}

/**
 * How many extensions to inspect at once. Each one is a handful of small
 * reads, and the number installed is up to the user.
 */
const DISCOVERY_CONCURRENCY = 8

function candidateEntries(entries: string[], binName: string): string[] {
    const prefix = `${binName}-`
    return entries.filter((entry) => entry.startsWith(prefix) && entry !== prefix)
}

/** Every extension installed for this CLI, sorted by command name. */
export async function discoverExtensions(options: DiscoverOptions): Promise<Extension[]> {
    let entries: string[]
    try {
        entries = await readdir(options.extensionsDir)
    } catch (error) {
        // No extensions directory is the ordinary case and means no
        // extensions. Anything else — a permission problem, a broken mount —
        // is a real failure, and reporting it as "none installed" would leave
        // the user wondering where their extensions went.
        if (isMissingFile(error)) return []
        throw error
    }

    const described = await mapWithConcurrency(
        candidateEntries(entries, options.binName),
        DISCOVERY_CONCURRENCY,
        (entry) => describe(entry, options),
    )

    return described
        .filter((extension): extension is Extension => extension !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * One extension by command name, inspecting only the entry that could match.
 *
 * `dispatch`, `remove` and a targeted `upgrade` all know which extension they
 * want, and reading every other extension's manifests and git remote to find
 * it would be work done for nothing.
 */
export async function findExtension(
    name: string,
    options: DiscoverOptions,
): Promise<Extension | undefined> {
    const entry = toDirName(options.binName, name)
    if (!(await exists(join(options.extensionsDir, entry)))) return undefined
    return describe(entry, options)
}

/**
 * The git operations the extension system needs. Every one of them shells out
 * to the user's own git, so clones inherit whatever credential helper and SSH
 * configuration they already have.
 */

import { CliError } from '@doist/cli-core'
import { outputHints, run, type RunResult } from './run.js'

function requireGit(result: RunResult): void {
    if (result.missing) {
        throw new CliError('EXTENSION_INSTALL_FAILED', 'git was not found on PATH.', {
            hints: ['Install git, or install this extension from a release binary instead.'],
        })
    }
}

export async function clone(url: string, destination: string): Promise<void> {
    const result = await run('git', ['clone', '--quiet', url, destination])
    requireGit(result)
    if (result.code !== 0) {
        throw new CliError('EXTENSION_NOT_INSTALLABLE', `Could not clone ${url}.`, {
            hints: outputHints(result),
        })
    }
}

export async function checkout(dir: string, ref: string): Promise<void> {
    const result = await run('git', ['checkout', '--quiet', ref], { cwd: dir })
    requireGit(result)
    if (result.code !== 0) {
        throw new CliError('EXTENSION_NOT_INSTALLABLE', `Could not check out "${ref}".`, {
            hints: outputHints(result),
        })
    }
}

/** Full commit SHA of HEAD, or undefined when the directory is not a clone. */
export async function headSha(dir: string): Promise<string | undefined> {
    const result = await run('git', ['rev-parse', 'HEAD'], { cwd: dir })
    if (result.code !== 0) return undefined
    return result.stdout.trim() || undefined
}

/**
 * Whether the working tree holds changes the user would not want deleted.
 *
 * `unknown` is its own answer rather than being folded into `clean`: git may
 * be missing, the repository may be flagged as unsafe to use, or `.git` may be
 * damaged, and in each of those cases the honest position is that the state
 * could not be established — callers treat that as a reason to stop, not a
 * licence to delete.
 */
export type WorkingTreeState = 'clean' | 'dirty' | 'unknown'

export async function workingTreeState(dir: string): Promise<WorkingTreeState> {
    const result = await run('git', ['status', '--porcelain'], { cwd: dir })
    if (result.missing || result.code !== 0) return 'unknown'
    return result.stdout.trim().length > 0 ? 'dirty' : 'clean'
}

export type PullResult = { changed: boolean; from?: string; to?: string; error?: string }

/** Fast-forward the clone. Never rewrites local work; `resetToRemote` does that. */
export async function pull(dir: string): Promise<PullResult> {
    const from = await headSha(dir)
    const result = await run('git', ['pull', '--quiet', '--ff-only'], { cwd: dir })
    requireGit(result)
    if (result.code !== 0) {
        return { changed: false, from, error: outputHints(result).join(' ') }
    }
    const to = await headSha(dir)
    return { changed: from !== to, from, to }
}

/** Discard local commits and working-tree changes in favour of the remote. */
export async function resetToRemote(dir: string): Promise<PullResult> {
    const from = await headSha(dir)
    const fetched = await run('git', ['fetch', '--quiet', 'origin'], { cwd: dir })
    requireGit(fetched)
    if (fetched.code !== 0) {
        return { changed: false, from, error: outputHints(fetched).join(' ') }
    }
    const reset = await run('git', ['reset', '--quiet', '--hard', 'origin/HEAD'], { cwd: dir })
    if (reset.code !== 0) {
        return { changed: false, from, error: outputHints(reset).join(' ') }
    }
    const to = await headSha(dir)
    return { changed: from !== to, from, to }
}

/** Commit the remote's default branch points at, without fetching it. */
export async function remoteHeadSha(dir: string): Promise<string | undefined> {
    const result = await run('git', ['ls-remote', 'origin', 'HEAD'], { cwd: dir })
    if (result.code !== 0) return undefined
    return result.stdout.trim().split(/\s+/)[0] || undefined
}

/** Resolve a ref to the SHA it names, used when pinning a clone. */
export async function resolveRef(dir: string, ref: string): Promise<string | undefined> {
    const result = await run('git', ['rev-parse', ref], { cwd: dir })
    if (result.code !== 0) return undefined
    return result.stdout.trim() || undefined
}

/** Files that changed between two commits, used to decide if deps need reinstalling. */
export async function changedFiles(dir: string, from: string, to: string): Promise<string[]> {
    const result = await run('git', ['diff', '--name-only', `${from}..${to}`], { cwd: dir })
    if (result.code !== 0) return []
    return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
}

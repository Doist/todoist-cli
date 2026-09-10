/**
 * The git operations the extension system needs. Every one of them shells out
 * to the user's own git, so clones inherit whatever credential helper and SSH
 * configuration they already have.
 */

import { CliError } from '@doist/cli-core'
import { outputHints, run, type RunResult } from './run.js'

/**
 * Remove credentials from a URL before it is shown to anyone.
 *
 * A private-repo remote can legitimately carry `user:token@`, and a failed
 * clone would otherwise print that token to the terminal and into any log
 * that captured it.
 */
export function redactUrl(url: string): string {
    return url.replace(/(\w+:\/\/)[^/@\s]*@/, '$1***@')
}

/**
 * Refuse an argument that git would read as an option.
 *
 * Repository URLs and refs arrive from manifests and from the command line. A
 * value starting with a dash would otherwise choose git's behaviour rather
 * than being the thing git acts on, and for local transports some of those
 * options run a command.
 */
function requirePositional(value: string, what: string): void {
    if (value.startsWith('-')) {
        throw new CliError('EXTENSION_NOT_INSTALLABLE', `A ${what} cannot start with "-".`, {
            hints: [`Got: ${redactUrl(value)}`],
        })
    }
}

function requireGit(result: RunResult): void {
    if (result.missing) {
        throw new CliError('EXTENSION_INSTALL_FAILED', 'git was not found on PATH.', {
            hints: ['Install git, or install this extension from a release binary instead.'],
        })
    }
}

export async function clone(url: string, destination: string): Promise<void> {
    requirePositional(url, 'repository URL')
    const result = await run('git', ['clone', '--quiet', '--', url, destination])
    requireGit(result)
    if (result.code !== 0) {
        throw new CliError('EXTENSION_NOT_INSTALLABLE', `Could not clone ${redactUrl(url)}.`, {
            hints: outputHints(result).map(redactUrl),
        })
    }
}

export async function checkout(dir: string, ref: string): Promise<void> {
    requirePositional(ref, 'git ref')
    const result = await run('git', ['checkout', '--quiet', ref, '--'], { cwd: dir })
    requireGit(result)
    if (result.code !== 0) {
        throw new CliError('EXTENSION_NOT_INSTALLABLE', `Could not check out "${ref}".`, {
            hints: outputHints(result).map(redactUrl),
        })
    }
}

/** Full commit SHA of HEAD, or undefined when the directory is not a clone. */
export async function headSha(dir: string): Promise<string | undefined> {
    return resolveRef(dir, 'HEAD')
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

/**
 * Discard local commits and working-tree changes in favour of the remote.
 *
 * The target comes from the remote itself rather than from `origin/HEAD`,
 * which is written at clone time and never updated by a fetch: after a
 * repository renames its default branch, that symref still names the old one.
 * Untracked files are cleared too, since leaving them would keep local code in
 * a clone the user asked to be reset.
 */
export async function resetToRemote(dir: string): Promise<PullResult> {
    const from = await headSha(dir)

    const fetched = await run('git', ['fetch', '--quiet', 'origin'], { cwd: dir })
    requireGit(fetched)
    if (fetched.code !== 0) {
        return { changed: false, from, error: outputHints(fetched).join(' ') }
    }

    const target = await remoteHeadSha(dir)
    if (!target) {
        return { changed: false, from, error: 'could not resolve the remote HEAD' }
    }

    const reset = await run('git', ['reset', '--quiet', '--hard', target], { cwd: dir })
    if (reset.code !== 0) {
        return { changed: false, from, error: outputHints(reset).join(' ') }
    }

    // Ignored files are left alone: they are build output and caches, not
    // local work, and node_modules is among them.
    await run('git', ['clean', '--quiet', '-fd'], { cwd: dir })

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
    requirePositional(ref, 'git ref')
    const result = await run('git', ['rev-parse', ref], { cwd: dir })
    if (result.code !== 0) return undefined
    return result.stdout.trim() || undefined
}

/**
 * Whether any of the given paths changed between two commits.
 *
 * `unknown` rather than `false` when git could not answer, because the caller
 * uses this to decide whether to reinstall dependencies, and "could not tell"
 * is a reason to reinstall rather than a reason to skip.
 */
export async function pathsChanged(
    dir: string,
    from: string,
    to: string,
    paths: string[],
): Promise<boolean | 'unknown'> {
    const result = await run('git', ['diff', '--quiet', `${from}..${to}`, '--', ...paths], {
        cwd: dir,
    })
    if (result.code === 0) return false
    if (result.code === 1) return true
    return 'unknown'
}

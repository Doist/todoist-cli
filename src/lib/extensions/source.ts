/**
 * Naming rules and install-source parsing.
 *
 * Every filename convention in the extension system derives from the host's
 * binary name: `td` gives directories named `td-<name>`, an author manifest of
 * `td-extension.json` and a CLI-written manifest of `.td-manifest.json`.
 */

import { isAbsolute } from 'node:path'
import { CliError } from '@doist/cli-core'

/** Directory (and executable) name for a command name: `goals` → `td-goals`. */
export function toDirName(binName: string, name: string): string {
    return name.startsWith(`${binName}-`) ? name : `${binName}-${name}`
}

/** Command name for a directory name: `td-goals` → `goals`. */
export function toCommandName(binName: string, dirName: string): string {
    const prefix = `${binName}-`
    return dirName.startsWith(prefix) ? dirName.slice(prefix.length) : dirName
}

/** Name of the manifest the CLI writes for binary installs. */
export function manifestFileName(binName: string): string {
    return `.${binName}-manifest.json`
}

/** Name of the manifest an extension author ships. */
export function authoredManifestFileName(binName: string): string {
    return `${binName}-extension.json`
}

/**
 * Accepts `goals`, `td-goals` or `Doist/td-goals` and returns the command
 * name. Used by `remove`, `upgrade` and `exec`, which all take a loose ref.
 */
export function normalizeSelector(binName: string, selector: string): string {
    const withoutOwner = selector.includes('/') ? (selector.split('/').pop() ?? selector) : selector
    return toCommandName(binName, withoutOwner)
}

export function validateExtensionName(binName: string, dirName: string): void {
    const pattern = new RegExp(`^${binName}-[a-z0-9][a-z0-9-]*$`)
    if (!pattern.test(dirName)) {
        throw new CliError(
            'EXTENSION_NAME_INVALID',
            `"${dirName}" is not a valid extension name.`,
            {
                hints: [
                    `Extension repositories must be named ${binName}-<name>, lowercase, starting with a letter or digit.`,
                ],
            },
        )
    }
}

export type ParsedSource =
    | { type: 'local'; path: string }
    | { type: 'git'; host: string; owner: string; repo: string; url: string; isGitHub: boolean }

const GITHUB_HOST = 'github.com'

function stripGitSuffix(repo: string): string {
    return repo.endsWith('.git') ? repo.slice(0, -'.git'.length) : repo
}

function looksLikeLocalPath(source: string): boolean {
    if (source === '.' || source === '..') return true
    if (source.startsWith('./') || source.startsWith('../')) return true
    if (source.startsWith('~/')) return true
    if (source.startsWith('.\\') || source.startsWith('..\\')) return true
    if (isAbsolute(source)) return true
    // Windows drive-relative paths such as `C:foo` are not worth supporting.
    return /^[a-zA-Z]:[\\/]/.test(source)
}

/**
 * Work out what an install source refers to. A bare `owner/repo` means
 * GitHub; any other URL is cloned with git and never touches the GitHub API.
 */
export function parseSource(source: string): ParsedSource {
    if (looksLikeLocalPath(source)) {
        return { type: 'local', path: source }
    }

    const scpLike = source.match(/^(?:[^@]+@)?([^:/]+):(.+?)\/([^/]+?)(?:\.git)?$/)
    if (scpLike && !source.includes('://')) {
        const [, host, owner, repo] = scpLike
        return {
            type: 'git',
            host,
            owner,
            repo: stripGitSuffix(repo),
            url: source,
            isGitHub: host === GITHUB_HOST,
        }
    }

    if (source.includes('://')) {
        let url: URL
        try {
            url = new URL(source)
        } catch {
            throw new CliError('EXTENSION_NOT_INSTALLABLE', `"${source}" is not a valid URL.`)
        }
        const segments = url.pathname.split('/').filter(Boolean)
        if (segments.length < 2) {
            throw new CliError(
                'EXTENSION_NOT_INSTALLABLE',
                `"${source}" does not look like a repository URL.`,
                { hints: ['Expected a URL ending in <owner>/<repo>.'] },
            )
        }
        const repo = stripGitSuffix(segments[segments.length - 1])
        const owner = segments[segments.length - 2]
        return {
            type: 'git',
            host: url.host,
            owner,
            repo,
            url: source,
            isGitHub: url.host === GITHUB_HOST,
        }
    }

    const shorthand = source.match(/^([^/\s]+)\/([^/\s]+)$/)
    if (shorthand) {
        const [, owner, repo] = shorthand
        return {
            type: 'git',
            host: GITHUB_HOST,
            owner,
            repo: stripGitSuffix(repo),
            url: `https://${GITHUB_HOST}/${owner}/${stripGitSuffix(repo)}.git`,
            isGitHub: true,
        }
    }

    throw new CliError('EXTENSION_NOT_INSTALLABLE', `Cannot work out what "${source}" refers to.`, {
        hints: ['Use <owner>/<repo>, a full repository URL, or a path to a local directory.'],
    })
}

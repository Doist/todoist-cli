/**
 * Installing an extension.
 *
 * Three shapes are supported: a prebuilt release binary, a git clone, and a
 * symlink to a directory the user is working in. Everything is assembled in a
 * staging directory inside the extensions directory and moved into place only
 * once it is complete, so a failed install never leaves a half-written
 * extension behind and never destroys the one already installed.
 */

import {
    chmod,
    lstat,
    mkdir,
    mkdtemp,
    readdir,
    rename,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { CliError } from '@doist/cli-core'
import { findExtension } from './discover.js'
import { exists, isDirectory, isExecutable } from './fs-utils.js'
import { checkout, clone, headSha, resolveRef } from './git.js'
import {
    assetSuffixes,
    findExpectedChecksum,
    type GitHubClient,
    pickAsset,
    sha256,
    verifyChecksum,
} from './github.js'
import { isFromNewerFormat, MANIFEST_VERSION } from './manifest-format.js'
import { pickAuthoredFields, writeInstalledManifest } from './manifest.js'
import { installDependencies } from './npm.js'
import {
    authoredManifestFileName,
    parseSource,
    requireUsableName,
    toCommandName,
} from './source.js'
import { removeState, writeState } from './state.js'
import type { AuthoredManifest, Extension, InstallOptions, InstallResult } from './types.js'

export type InstallContext = {
    binName: string
    extensionsDir: string
    stateDir: string
    officialSource: { host: string; owner: string }
    client: GitHubClient
    reservedNames: () => Iterable<string>
    log: (message: string) => void
    warn: (message: string) => void
    trustWarning: string
}

function expandHome(path: string): string {
    return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

/**
 * Name checks and collision handling, run before anything is downloaded or
 * cloned so that a doomed install fails without touching the network.
 */
async function preflight(
    dirName: string,
    context: InstallContext,
    options: InstallOptions,
): Promise<Extension | undefined> {
    const name = requireUsableName(
        context.binName,
        dirName,
        context.reservedNames,
        (taken) =>
            `An extension cannot take that name. It would only be reachable as \`${context.binName} extension exec ${taken}\`.`,
    )

    // Only the entry that could collide, rather than describing every
    // installed extension to find out about one.
    const existing = await findExtension(name, {
        extensionsDir: context.extensionsDir,
        stateDir: context.stateDir,
        binName: context.binName,
        officialSource: context.officialSource,
    })
    if (existing && !options.force) {
        throw new CliError(
            'EXTENSION_ALREADY_INSTALLED',
            `"${name}" is already installed${existing.source ? ` from ${existing.source}` : ''}.`,
            {
                hints: [
                    `Run \`${context.binName} extension upgrade ${name}\` to update it.`,
                    `Run \`${context.binName} extension install … --force\` to replace it.`,
                ],
            },
        )
    }
    return existing
}

async function stagingDir(extensionsDir: string, dirName: string): Promise<string> {
    await mkdir(extensionsDir, { recursive: true })
    // mkdtemp picks a name nothing else can be holding, which hand-rolling one
    // from the process id and the clock does not guarantee.
    return mkdtemp(join(extensionsDir, `.staging-${dirName}-`))
}

/**
 * Put the staged directory in place of whatever is installed.
 *
 * The old install is moved aside rather than deleted first, so that a failure
 * part-way through leaves something to put back instead of leaving the user
 * with no extension at all.
 */
/** True when anything at all occupies the path, a dangling symlink included. */
async function occupied(path: string): Promise<boolean> {
    try {
        await lstat(path)
        return true
    } catch {
        return false
    }
}

type Displaced = { discard: () => Promise<void>; restore: () => Promise<void> }

const NOTHING_DISPLACED: Displaced = {
    discard: async () => undefined,
    restore: async () => undefined,
}

/**
 * Put the staged directory in place of whatever is installed, and hand back
 * the means to finish or undo it.
 *
 * The old install is moved aside rather than deleted, and stays there until
 * the caller has finished everything that could still fail. A failure part-way
 * through therefore leaves something to put back, instead of leaving the user
 * with no extension at all.
 */
async function moveIntoPlace(
    staged: string,
    destination: string,
    existing: Extension | undefined,
): Promise<Displaced> {
    // A dot prefix keeps the set-aside copy from looking like an installed
    // extension if anything stops this run before it is cleaned up.
    const displaced = join(dirname(destination), `.replaced-${basename(destination)}-${Date.now()}`)
    let movedAside = false

    if (existing && existing.entryPath !== destination) {
        await rm(existing.entryPath, { recursive: true, force: true })
    }

    // lstat, not stat: a local install whose target has been deleted is a
    // dangling link, which still occupies the destination.
    if (await occupied(destination)) {
        await rename(destination, displaced)
        movedAside = true
    }

    try {
        await rename(staged, destination)
    } catch (error) {
        if (movedAside) await rename(displaced, destination).catch(() => undefined)
        throw error
    }

    if (!movedAside) return NOTHING_DISPLACED

    return {
        discard: async () => {
            await rm(displaced, { recursive: true, force: true })
        },
        restore: async () => {
            await rm(destination, { recursive: true, force: true })
            await rename(displaced, destination).catch(() => undefined)
        },
    }
}

export async function installBinary(
    parsed: { host: string; owner: string; repo: string },
    release: { tag: string; assets: { name: string; url: string; size: number }[] },
    asset: { name: string; url: string; size: number },
    options: InstallOptions,
    context: InstallContext,
    existing: Extension | undefined,
): Promise<InstallResult> {
    const dirName = parsed.repo
    const destination = join(context.extensionsDir, dirName)
    const staged = await stagingDir(context.extensionsDir, dirName)

    try {
        const [data, expected, authoredRaw] = await Promise.all([
            context.client.downloadAsset(asset),
            findExpectedChecksum(context.client, release, asset.name),
            context.client.fetchRepoFile(
                parsed.owner,
                parsed.repo,
                authoredManifestFileName(context.binName),
                release.tag,
            ),
        ])

        verifyChecksum(data, expected, asset.name)
        if (!expected.published) {
            context.warn(
                `${parsed.owner}/${parsed.repo} publishes no checksums, so the download could not be verified.`,
            )
        }

        const executableName = asset.name.endsWith('.exe') ? `${dirName}.exe` : dirName
        const executablePath = join(staged, executableName)
        await writeFile(executablePath, data)
        await chmod(executablePath, 0o755)

        let authored: AuthoredManifest = {}
        if (authoredRaw) {
            // Parsed and then sifted, because a file that is valid JSON can
            // still be null, an array, or full of the wrong types.
            let parsedManifest: unknown
            try {
                parsedManifest = JSON.parse(authoredRaw)
            } catch {
                parsedManifest = undefined
            }
            const picked = await pickAuthoredFields(parsedManifest)
            if (picked) {
                authored = picked
            } else {
                context.warn(
                    `Ignoring ${authoredManifestFileName(context.binName)} in ${parsed.owner}/${parsed.repo}: it is not a JSON object.`,
                )
            }
        }

        await writeInstalledManifest(staged, context.binName, {
            manifestVersion: MANIFEST_VERSION,
            owner: parsed.owner,
            name: dirName,
            host: parsed.host,
            tag: release.tag,
            pinned: Boolean(options.pin),
            asset: asset.name,
            sha256: sha256(data),
            installedAt: new Date().toISOString(),
            description: authored.description,
            requires: authored.requires,
            completion: authored.completion,
        })

        if (isFromNewerFormat(authored)) {
            context.warn(
                `${parsed.owner}/${parsed.repo} declares a ${authoredManifestFileName(context.binName)} format newer than this ${context.binName} understands, so some of its metadata was ignored.`,
            )
        }

        const displaced = await moveIntoPlace(staged, destination, existing)
        try {
            await writeState(context.stateDir, dirName, {
                pinned: options.pin ? release.tag : undefined,
            })
        } catch (error) {
            // Nothing is installed rather than half-installed: the previous
            // extension goes back, and the command reports the failure.
            await displaced.restore()
            throw error
        }
        await displaced.discard()

        return {
            name: toCommandName(context.binName, dirName),
            dirName,
            kind: 'binary',
            source: `${parsed.owner}/${parsed.repo}`,
            version: release.tag,
            dir: destination,
        }
    } finally {
        await rm(staged, { recursive: true, force: true })
    }
}

async function installGit(
    parsed: { host: string; owner: string; repo: string; url: string },
    options: InstallOptions,
    context: InstallContext,
    existing: Extension | undefined,
): Promise<InstallResult> {
    const dirName = parsed.repo
    const destination = join(context.extensionsDir, dirName)
    const staged = await stagingDir(context.extensionsDir, dirName)
    // git refuses to clone into a directory that already has entries.
    await rm(staged, { recursive: true, force: true })

    let moved = false
    try {
        await clone(parsed.url, staged)

        let pinnedSha: string | undefined
        if (options.pin) {
            await checkout(staged, options.pin)
            pinnedSha = await resolveRef(staged, 'HEAD')
        }

        // Executable, not merely present: a directory or an unexecutable file
        // by that name would install happily and only fail when run.
        if (!(await isExecutable(join(staged, dirName)))) {
            const present = await exists(join(staged, dirName))
            throw new CliError(
                'EXTENSION_NOT_INSTALLABLE',
                present
                    ? `"${dirName}" in ${parsed.owner}/${parsed.repo} is not an executable file.`
                    : `${parsed.owner}/${parsed.repo} has no executable named "${dirName}" at its root.`,
                {
                    hints: [
                        `An extension repository must contain a file named ${dirName} that ${context.binName} can run.`,
                        present ? 'Give it an executable bit: chmod +x it and commit that.' : '',
                    ].filter(Boolean),
                },
            )
        }

        await installDependencies(staged)

        const version = (await headSha(staged))?.slice(0, 8)
        const displaced = await moveIntoPlace(staged, destination, existing)
        moved = true
        try {
            await writeState(context.stateDir, dirName, {
                pinned: options.pin ? (pinnedSha ?? options.pin) : undefined,
            })
        } catch (error) {
            await displaced.restore()
            throw error
        }
        await displaced.discard()

        return {
            name: toCommandName(context.binName, dirName),
            dirName,
            kind: 'git',
            source: `${parsed.owner}/${parsed.repo}`,
            version,
            dir: destination,
        }
    } finally {
        if (!moved) await rm(staged, { recursive: true, force: true })
    }
}

async function installLocal(
    path: string,
    options: InstallOptions,
    context: InstallContext,
): Promise<InstallResult> {
    const target = resolve(expandHome(path))
    const dirName = basename(target)

    if (!(await exists(target))) {
        throw new CliError('EXTENSION_NOT_INSTALLABLE', `${target} does not exist.`)
    }

    if (!(await isDirectory(target))) {
        throw new CliError(
            'EXTENSION_NOT_INSTALLABLE',
            `${target} is not a directory, so it cannot hold an extension.`,
            {
                hints: [
                    `A local install points at a directory named ${dirName} that contains an executable of the same name.`,
                ],
            },
        )
    }

    const existing = await preflight(dirName, context, options)

    if (!(await exists(join(target, dirName)))) {
        context.warn(
            `${target} has no executable named "${dirName}" yet. Build it before running \`${context.binName} ${toCommandName(context.binName, dirName)}\`.`,
        )
    }

    await mkdir(context.extensionsDir, { recursive: true })
    const destination = join(context.extensionsDir, dirName)

    // Built beside the destination and renamed over it, so a failure leaves
    // the extension that is already installed alone.
    const pending = join(context.extensionsDir, `.pending-${dirName}-${Date.now()}`)
    if (process.platform === 'win32') {
        // Symlinks need elevated rights on Windows, so record the target in a
        // plain file and resolve it at discovery time instead.
        await writeFile(pending, target, 'utf8')
    } else {
        await symlink(target, pending, 'dir')
    }

    try {
        if (existing && existing.entryPath !== destination) {
            await rm(existing.entryPath, { recursive: true, force: true })
        }
        await rm(destination, { recursive: true, force: true })
        await rename(pending, destination)
    } catch (error) {
        await rm(pending, { recursive: true, force: true })
        throw error
    }

    // A local install tracks a directory, so any pin or update bookkeeping
    // left by whatever was installed here before no longer describes anything.
    if (existing) await removeState(context.stateDir, dirName)

    return {
        name: toCommandName(context.binName, dirName),
        dirName,
        kind: 'local',
        source: target,
        dir: target,
    }
}

/** Install from `owner/repo`, a repository URL, or a local directory. */
export async function installExtension(
    source: string,
    options: InstallOptions,
    context: InstallContext,
): Promise<InstallResult> {
    const parsed = parseSource(source)

    if (parsed.type === 'local') {
        return installLocal(parsed.path, options, context)
    }

    const existing = await preflight(parsed.repo, context, options)

    // Printed before anything is downloaded, cloned or executed, so the user
    // sees it even when a later step runs code from the repository.
    context.warn(context.trustWarning)

    if (parsed.isGitHub) {
        const release = await context.client.fetchRelease(parsed.owner, parsed.repo, options.pin)
        const asset = release ? pickAsset(release.assets, assetSuffixes()) : undefined
        if (release && asset) {
            return installBinary(parsed, release, asset, options, context, existing)
        }
        // No release, or none carrying an asset for this machine: fall through
        // to a clone, which can also resolve a pinned tag as a git ref.
    }

    return installGit(parsed, options, context, existing)
}

/** True when the extensions directory holds nothing at all. */
export async function isEmpty(extensionsDir: string): Promise<boolean> {
    try {
        return (await readdir(extensionsDir)).length === 0
    } catch {
        return true
    }
}

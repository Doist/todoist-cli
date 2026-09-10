/**
 * Upgrading installed extensions.
 *
 * Git clones fast-forward, release binaries are re-downloaded when the tag has
 * moved, and local installs are left alone because the user's own working
 * directory is already the source of truth. A pin is honoured unless the user
 * explicitly forces past it.
 */

import { mapWithConcurrency } from './concurrency.js'
import { headSha, pathsChanged, pull, remoteHeadSha, resetToRemote } from './git.js'
import { assetSuffixes, pickAsset } from './github.js'
import { installBinary, type InstallContext } from './install.js'
import { installDependencies } from './npm.js'
import { run } from './run.js'
import { readState, writeState } from './state.js'
import type { Extension, UpgradeOptions, UpgradeResult } from './types.js'

/** Files whose change means the extension's dependencies must be reinstalled. */
const DEPENDENCY_FILES = ['package.json', 'package-lock.json']

/**
 * The trust warning belongs on upgrades as much as installs — an upgrade
 * fetches new code and can run it, through lifecycle scripts. One warning
 * covers a whole run, so `upgrade --all` does not repeat itself once per
 * extension.
 */
export function createTrustWarner(context: InstallContext): () => void {
    let warned = false
    return () => {
        if (warned) return
        warned = true
        context.warn(context.trustWarning)
    }
}

async function upgradeGit(
    extension: Extension,
    options: UpgradeOptions,
    context: InstallContext,
    warnTrust: () => void,
): Promise<UpgradeResult> {
    if (options.dryRun) {
        const [before, remote] = await Promise.all([
            headSha(extension.dir),
            remoteHeadSha(extension.dir),
        ])
        if (!remote) {
            // Offline, or the remote refused: reporting "up to date" would
            // claim something this run never established.
            return {
                name: extension.name,
                outcome: 'skipped',
                detail: 'could not reach the remote to check for updates',
            }
        }
        if (!before || remote === before) {
            return { name: extension.name, outcome: 'up-to-date' }
        }
        return {
            name: extension.name,
            outcome: 'would-upgrade',
            from: before.slice(0, 8),
            to: remote.slice(0, 8),
        }
    }

    warnTrust()
    const result = options.force ? await resetToRemote(extension.dir) : await pull(extension.dir)

    if (result.error) {
        return { name: extension.name, outcome: 'skipped', detail: result.error }
    }
    if (!result.changed) {
        return { name: extension.name, outcome: 'up-to-date' }
    }

    if (options.force && extension.pinned) {
        // Only now that the clone has actually moved: clearing the pin after a
        // reset that failed or did nothing would quietly unpin the extension.
        const state = await readState(context.stateDir, extension.dirName)
        await writeState(context.stateDir, extension.dirName, { ...state, pinned: undefined })
    }

    if (result.from && result.to) {
        const changed = await pathsChanged(extension.dir, result.from, result.to, DEPENDENCY_FILES)
        // "Could not tell" reinstalls: a slow upgrade costs less than an
        // extension left with dependencies that no longer match its code.
        if (changed !== false) {
            try {
                await installDependencies(extension.dir)
            } catch (error) {
                // The clone has already moved, and a later upgrade would find
                // it up to date and never retry, so put it back where its
                // dependencies still match its code.
                await run('git', ['reset', '--quiet', '--hard', result.from], {
                    cwd: extension.dir,
                })
                throw error
            }
        }
    }

    return {
        name: extension.name,
        outcome: 'upgraded',
        from: result.from?.slice(0, 8),
        to: result.to?.slice(0, 8),
    }
}

async function upgradeBinary(
    extension: Extension,
    options: UpgradeOptions,
    context: InstallContext,
    warnTrust: () => void,
): Promise<UpgradeResult> {
    const manifest = extension.manifest
    if (!manifest) {
        return {
            name: extension.name,
            outcome: 'skipped',
            detail: 'no manifest, so there is nothing to compare against',
        }
    }

    const release = await context.client.fetchRelease(manifest.owner, manifest.name)
    if (!release) {
        return { name: extension.name, outcome: 'skipped', detail: 'no releases found' }
    }
    if (release.tag === manifest.tag) {
        return { name: extension.name, outcome: 'up-to-date' }
    }

    const asset = pickAsset(release.assets, assetSuffixes())
    if (!asset) {
        return {
            name: extension.name,
            outcome: 'skipped',
            detail: `release ${release.tag} has no asset for ${process.platform}-${process.arch}`,
        }
    }

    if (options.dryRun) {
        return {
            name: extension.name,
            outcome: 'would-upgrade',
            from: manifest.tag,
            to: release.tag,
        }
    }

    warnTrust()
    await installBinary(
        { host: manifest.host, owner: manifest.owner, repo: manifest.name },
        release,
        asset,
        {},
        context,
        extension,
    )

    return { name: extension.name, outcome: 'upgraded', from: manifest.tag, to: release.tag }
}

export async function upgradeExtension(
    extension: Extension,
    options: UpgradeOptions,
    context: InstallContext,
    warnTrust: () => void = createTrustWarner(context),
): Promise<UpgradeResult> {
    if (extension.kind === 'local') {
        return {
            name: extension.name,
            outcome: 'skipped',
            detail: 'local installs always run whatever is in their directory',
        }
    }

    if (extension.pinned && !options.force) {
        const state = await readState(context.stateDir, extension.dirName)
        return {
            name: extension.name,
            outcome: 'skipped',
            detail: `pinned to ${state.pinned ?? extension.manifest?.tag ?? 'a fixed version'}`,
        }
    }

    return extension.kind === 'git'
        ? upgradeGit(extension, options, context, warnTrust)
        : upgradeBinary(extension, options, context, warnTrust)
}

/** Upgrade many extensions, bounding how many talk to GitHub at once. */
export async function upgradeExtensions(
    extensions: Extension[],
    options: UpgradeOptions,
    context: InstallContext,
): Promise<UpgradeResult[]> {
    const warnTrust = createTrustWarner(context)
    return mapWithConcurrency(extensions, 4, (extension) =>
        upgradeExtension(extension, options, context, warnTrust),
    )
}

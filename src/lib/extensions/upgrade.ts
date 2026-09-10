/**
 * Upgrading installed extensions.
 *
 * Git clones fast-forward, release binaries are re-downloaded when the tag has
 * moved, and local installs are left alone because the user's own working
 * directory is already the source of truth. A pin is honoured unless the user
 * explicitly forces past it.
 */

import { changedFiles, headSha, pull, remoteHeadSha, resetToRemote } from './git.js'
import { assetSuffixes, pickAsset } from './github.js'
import { installBinary, type InstallContext } from './install.js'
import { installDependencies } from './npm.js'
import { readState } from './state.js'
import type { Extension, UpgradeOptions, UpgradeResult } from './types.js'

/** Files whose change means the extension's dependencies must be reinstalled. */
const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json'])

/**
 * Run `worker` over every item, at most `limit` at a time. Upgrades hit the
 * GitHub API once per extension, and firing all of them at once is what
 * triggers secondary rate limits.
 */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = Array.from<R>({ length: items.length })
    let next = 0

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++
            results[index] = await worker(items[index])
        }
    })

    await Promise.all(runners)
    return results
}

async function upgradeGit(extension: Extension, options: UpgradeOptions): Promise<UpgradeResult> {
    const before = await headSha(extension.dir)

    if (options.dryRun) {
        const remote = await remoteHeadSha(extension.dir)
        if (!remote || !before || remote === before) {
            return { name: extension.name, outcome: 'up-to-date' }
        }
        return {
            name: extension.name,
            outcome: 'would-upgrade',
            from: before.slice(0, 8),
            to: remote.slice(0, 8),
        }
    }

    const result = options.force ? await resetToRemote(extension.dir) : await pull(extension.dir)

    if (result.error) {
        return { name: extension.name, outcome: 'skipped', detail: result.error }
    }
    if (!result.changed) {
        return { name: extension.name, outcome: 'up-to-date' }
    }

    if (result.from && result.to) {
        const changed = await changedFiles(extension.dir, result.from, result.to)
        if (changed.some((file) => DEPENDENCY_FILES.has(file))) {
            await installDependencies(extension.dir)
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
): Promise<UpgradeResult> {
    if (extension.kind === 'local') {
        return {
            name: extension.name,
            outcome: 'skipped',
            detail: 'local installs always run whatever is in their directory',
        }
    }

    const state = await readState(context.stateDir, extension.dirName)
    if (extension.pinned && !options.force) {
        return {
            name: extension.name,
            outcome: 'skipped',
            detail: `pinned to ${state.pinned ?? extension.manifest?.tag ?? 'a fixed version'}`,
        }
    }

    return extension.kind === 'git'
        ? upgradeGit(extension, options)
        : upgradeBinary(extension, options, context)
}

/** Upgrade many extensions, bounding how many talk to GitHub at once. */
export async function upgradeExtensions(
    extensions: Extension[],
    options: UpgradeOptions,
    context: InstallContext,
): Promise<UpgradeResult[]> {
    return mapWithConcurrency(extensions, 4, (extension) =>
        upgradeExtension(extension, options, context),
    )
}

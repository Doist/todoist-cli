/**
 * The extension manager: one object holding every operation the CLI needs,
 * configured entirely through its options.
 *
 * Nothing in this directory knows which CLI it is serving. The binary name,
 * directories, version, reserved command names and first-party source all
 * arrive here, which is what allows the whole thing to move to
 * `@doist/cli-core` and be adopted by another CLI with one call.
 */

import { join } from 'node:path'
import { CliError } from '@doist/cli-core'
import { mapWithConcurrency } from './concurrency.js'
import { discoverExtensions, findExtension } from './discover.js'
import { buildExtensionEnv, dispatchExtension } from './dispatch.js'
import { isExecutable } from './fs-utils.js'
import { headSha } from './git.js'
import { createGitHubClient } from './github.js'
import { installExtension, type InstallContext, isEmpty } from './install.js'
import { isFromNewerFormat } from './manifest-format.js'
import { readAuthoredManifest } from './manifest.js'
import { removeExtension } from './remove.js'
import { normalizeSelector } from './source.js'
import type {
    DispatchOptions,
    Extension,
    ExtensionListing,
    ExtensionManagerOptions,
    ExtensionTheme,
    InstallOptions,
    InstallResult,
    RemoveOptions,
    RemoveResult,
    UpgradeOptions,
    UpgradeResult,
} from './types.js'
import { upgradeExtensions } from './upgrade.js'
import { satisfiesRange } from './version-range.js'

export type ExtensionManager = {
    readonly binName: string
    readonly envPrefix: string
    readonly extensionsDir: string
    readonly officialLabel: string
    readonly theme: ExtensionTheme
    readonly trustWarning: string
    isAccessible(): boolean
    /** Everything installed, cheaply: no subprocesses, no network. */
    discover(): Promise<Extension[]>
    /** Resolve `goals`, `td-goals` or `owner/td-goals` to an installed extension. */
    find(selector: string): Promise<Extension | undefined>
    /** Like `find`, but throws the standard not-found error. */
    require(selector: string): Promise<Extension>
    /** Everything installed, with the details that cost extra work to learn. */
    list(): Promise<ExtensionListing[]>
    install(source: string, options?: InstallOptions): Promise<InstallResult>
    upgrade(selectors: string[], options?: UpgradeOptions): Promise<UpgradeResult[]>
    upgradeAll(options?: UpgradeOptions): Promise<UpgradeResult[]>
    remove(selector: string, options?: RemoveOptions): Promise<RemoveResult>
    /** Run an extension and resolve with the exit code the host should use. */
    dispatch(selector: string, args: string[], options?: DispatchOptions): Promise<number>
    /** True when no extension is installed, used to decide whether to advertise the feature. */
    isEmpty(): Promise<boolean>
}

const IDENTITY: ExtensionTheme = {
    dim: (text) => text,
    bold: (text) => text,
    green: (text) => text,
    yellow: (text) => text,
}

export function createExtensionManager(options: ExtensionManagerOptions): ExtensionManager {
    const {
        binName,
        envPrefix,
        version,
        dataDir,
        stateDir,
        configDir,
        hostPath,
        reservedNames,
        officialSource,
        officialLabel,
    } = options

    const extensionsDir = join(dataDir, 'extensions')
    const theme: ExtensionTheme = { ...IDENTITY, ...options.theme }
    const log = options.log ?? ((message: string) => console.log(message))
    const warn = options.warn ?? ((message: string) => console.error(message))
    const isAccessible = options.isAccessible ?? (() => false)
    const client = createGitHubClient(options.fetchImpl ?? fetch)

    const trustWarning =
        `Extensions are not reviewed, signed, or endorsed by ${officialLabel}. ` +
        `Installing one runs code from its publisher with your permissions and your ${officialLabel} credentials. ` +
        'Review the source before use.'

    const discoverOptions = { extensionsDir, stateDir, binName, officialSource }

    const installContext: InstallContext = {
        binName,
        extensionsDir,
        stateDir,
        officialSource,
        client,
        reservedNames,
        log,
        warn,
        trustWarning,
    }

    async function discover(): Promise<Extension[]> {
        return discoverExtensions(discoverOptions)
    }

    function notFound(name: string): CliError {
        return new CliError('EXTENSION_NOT_FOUND', `No extension named "${name}" is installed.`, {
            hints: [`Run \`${binName} extension list\` to see what is installed.`],
        })
    }

    /** Inspect the one entry that could match, rather than describing them all. */
    async function find(selector: string): Promise<Extension | undefined> {
        return findExtension(normalizeSelector(binName, selector), discoverOptions)
    }

    async function requireExtension(selector: string): Promise<Extension> {
        const name = normalizeSelector(binName, selector)
        const extension = await find(name)
        if (!extension) throw notFound(name)
        return extension
    }

    async function describeVersion(extension: Extension): Promise<string | undefined> {
        if (extension.kind === 'binary') return extension.manifest?.tag
        if (extension.kind === 'git') return (await headSha(extension.dir))?.slice(0, 8)
        return undefined
    }

    async function list(): Promise<ExtensionListing[]> {
        const extensions = await discover()
        const reserved = new Set(reservedNames())

        return mapWithConcurrency(extensions, 4, async (extension) => ({
            ...extension,
            version: await describeVersion(extension),
            shadowed: reserved.has(extension.name),
            executable: await isExecutable(extension.executablePath),
            // Read here rather than warned about on every run: an extension
            // whose metadata is newer still works, and listing is where
            // someone looks to find out why a description is missing.
            manifestFromNewerFormat: isFromNewerFormat(
                await readAuthoredManifest(extension.dir, binName),
            ),
        }))
    }

    /**
     * A `requires` range that the running host does not satisfy is a warning,
     * never a refusal: upgrading the CLI should not silently break an
     * extension that still works.
     */
    function warnIfIncompatible(extension: Extension): void {
        const range = extension.requires?.[binName]
        if (range && !satisfiesRange(version, range)) {
            warn(
                `Warning: ${extension.name} expects ${binName} ${range}, but this is ${binName} ${version}.`,
            )
        }
    }

    return {
        binName,
        envPrefix,
        extensionsDir,
        officialLabel,
        theme,
        trustWarning,
        isAccessible,
        discover,
        find,
        require: requireExtension,
        list,

        async install(source, installOptions = {}) {
            return installExtension(source, installOptions, installContext)
        },

        async upgrade(selectors, upgradeOptions = {}) {
            // Deduplicated first: `goals` and `td-goals` name one extension,
            // and two upgrades of one directory at once would write over each
            // other.
            const names = [
                ...new Set(selectors.map((selector) => normalizeSelector(binName, selector))),
            ]

            // One scan for the whole set, rather than one per name.
            const installed = await discover()
            const extensions = names.map((name) => {
                const extension = installed.find((candidate) => candidate.name === name)
                if (!extension) throw notFound(name)
                return extension
            })

            return upgradeExtensions(extensions, upgradeOptions, installContext)
        },

        async upgradeAll(upgradeOptions = {}) {
            return upgradeExtensions(await discover(), upgradeOptions, installContext)
        },

        async remove(selector, removeOptions = {}) {
            const extension = await requireExtension(selector)
            return removeExtension(extension, removeOptions, { binName, stateDir })
        },

        async dispatch(selector, args, dispatchOptions = {}) {
            const extension = await requireExtension(selector)
            warnIfIncompatible(extension)

            const env = buildExtensionEnv({
                envPrefix,
                version,
                configDir,
                hostPath,
                extension,
                user: dispatchOptions.user,
                accessible: isAccessible(),
                env: dispatchOptions.env,
            })

            return dispatchExtension(extension, args, env)
        },

        async isEmpty() {
            return isEmpty(extensionsDir)
        },
    }
}

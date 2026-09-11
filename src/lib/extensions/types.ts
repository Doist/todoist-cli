/**
 * Shared types for the extension system.
 *
 * Everything in `src/lib/extensions/` is host-agnostic: the CLI's name, its
 * directories, its version and its reserved command names all arrive through
 * `ExtensionManagerOptions`. Nothing here may import from `src/commands/` or
 * read this CLI's config, so the whole directory can move to
 * `@doist/cli-core` unchanged.
 */

/**
 * How an extension got onto disk, which decides how it is upgraded and
 * removed. Inferred from the directory, never stored in a registry.
 */
export type ExtensionKind = 'binary' | 'git' | 'local'

/**
 * The two manifest shapes are defined by their schemas, so the type and the
 * validation cannot drift. Re-exported as types only, which TypeScript erases,
 * so naming one here never pulls the validation library into the startup path.
 */
import type { AuthoredManifest, InstalledManifest } from './schemas.js'

export type { AuthoredManifest, InstalledManifest }

/** One installed extension, as discovered on disk. */
export type Extension = {
    /** Command name, e.g. `goals`. */
    name: string
    /** Directory name, e.g. `td-goals`. */
    dirName: string
    kind: ExtensionKind
    /** Directory holding the extension (the link target for local installs). */
    dir: string
    /** Absolute path to the executable that `dispatch` spawns. */
    executablePath: string
    /** Path of the entry inside the extensions directory. */
    entryPath: string
    /** `owner/repo`, a git URL, or a local path — whatever `list` should show. */
    source?: string
    host?: string
    owner?: string
    pinned: boolean
    /** The ref or tag it is pinned to, when it is pinned. */
    pinnedRef?: string
    official: boolean
    description?: string
    requires?: Record<string, string>
    manifest?: InstalledManifest
}

/** An extension plus the details that cost a subprocess or extra I/O to learn. */
export type ExtensionListing = Extension & {
    /** Release tag for binary installs, short SHA for git, undefined for local. */
    version?: string
    /** True when a built-in command of the same name hides this extension. */
    shadowed: boolean
    /** False when the executable is missing or lacks the executable bit. */
    executable: boolean
}

export type InstallOptions = {
    /** Release tag or git ref to install and hold at. */
    pin?: string
    /** Replace an extension that is already installed. */
    force?: boolean
}

export type InstallResult = {
    name: string
    dirName: string
    kind: ExtensionKind
    source: string
    version?: string
    dir: string
}

export type UpgradeOptions = {
    force?: boolean
    dryRun?: boolean
}

export type UpgradeOutcome = 'upgraded' | 'up-to-date' | 'skipped' | 'would-upgrade'

export type UpgradeResult = {
    name: string
    outcome: UpgradeOutcome
    /** Why a skip happened, or what changed on an upgrade. */
    detail?: string
    from?: string
    to?: string
}

export type RemoveOptions = {
    force?: boolean
}

export type RemoveResult = {
    name: string
    kind: ExtensionKind
    /** What was deleted: the whole directory, or just the link for local installs. */
    removed: 'directory' | 'link'
    path: string
}

export type DispatchOptions = {
    /** Value of `--user` seen before the command token, forwarded as `<PREFIX>_USER`. */
    user?: string
    /** Extra environment for the child, merged last. */
    env?: Record<string, string | undefined>
}

/** Colour helpers. Defaults are identity functions, so the library never needs chalk. */
export type ExtensionTheme = {
    dim: (text: string) => string
    bold: (text: string) => string
    green: (text: string) => string
    yellow: (text: string) => string
}

export type ExtensionManagerOptions = {
    /** Binary name of the host CLI, e.g. `td`. Drives every naming convention. */
    binName: string
    /** Environment variable prefix for the child process, e.g. `TD`. */
    envPrefix: string
    /** Host version, used for `<PREFIX>_VERSION` and the `requires` check. */
    version: string
    /** Per-user data directory for this CLI. Extensions live in `<dataDir>/extensions`. */
    dataDir: string
    /** Per-user state directory for this CLI. */
    stateDir: string
    /** Config directory, passed to extensions as `<PREFIX>_CONFIG_DIR`. */
    configDir: string
    /** Absolute path to the host's entry script, passed as `<PREFIX>_PATH`. */
    hostPath: string
    /** Built-in command names and aliases an extension must not shadow. */
    reservedNames: () => Iterable<string>
    /** Install source that earns the first-party marker. */
    officialSource: { host: string; owner: string }
    /** Label shown for first-party extensions, e.g. `Todoist`. */
    officialLabel: string
    /** True when colour must not carry meaning on its own. */
    isAccessible?: () => boolean
    theme?: Partial<ExtensionTheme>
    log?: (message: string) => void
    warn?: (message: string) => void
    /** Injectable for tests. Defaults to the global `fetch`. */
    fetchImpl?: typeof fetch
}

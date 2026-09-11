/**
 * The `<bin> extension` command group.
 *
 * Registered against a `Command` the host owns, driven entirely by the manager
 * it is handed. Like the rest of this directory it knows nothing about which
 * CLI it is serving: colours come from `manager.theme`, accessible mode from
 * `manager.isAccessible()`, and every string that names the binary is built
 * from `manager.binName`.
 *
 * That means no chalk, nothing from the host's `lib/`, and `commander` as a
 * type only — the host passes the program in.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { CliError, formatJson, printEmpty } from '@doist/cli-core'
import type { Command } from 'commander'
import type { ExtensionManager } from './manager.js'
import type { ExtensionListing, RemoveResult, UpgradeResult } from './types.js'

/** Neither column has a value worth showing, so say so once, the same way. */
const NOTHING = '—'

/**
 * The arguments an extension is given, read back off the real argv.
 *
 * Commander cannot supply them: it consumes any root option it recognises
 * before the action runs, so `exec goals --quiet` would reach the extension
 * with `--quiet` already eaten. `passThroughOptions` is not an answer either —
 * it requires `enablePositionalOptions` on the parent, which makes ordinary
 * commands reject the global flags they accept today.
 *
 * The search starts after the subcommand token so that a value elsewhere on
 * the line cannot be mistaken for the name.
 */
function argsAfter(marker: string, name: string): string[] {
    const markerIndex = process.argv.indexOf(marker, 2)
    if (markerIndex === -1) return []
    const nameIndex = process.argv.indexOf(name, markerIndex + 1)
    return nameIndex === -1 ? [] : process.argv.slice(nameIndex + 1)
}

/** `/home/alice/code/td-x` reads better as `~/code/td-x`, and fits the column. */
function shorten(path: string): string {
    const home = homedir()
    return home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

/**
 * The kind, plus whatever is worth knowing about this particular install.
 * Everything lands in one column because each note is rare and none of them
 * deserves a column of its own that is empty for almost every row.
 */
function describeKind(entry: ExtensionListing, binName: string): string {
    const notes: string[] = []
    if (entry.shadowed) notes.push(`shadowed by built-in "${entry.name}"`)
    if (!entry.executable) notes.push('not executable')
    if (entry.manifestFromNewerFormat) notes.push(`manifest needs a newer ${binName}`)

    const pinned = entry.pinned ? ' (pinned)' : ''
    const suffix = notes.length > 0 ? ` · ${notes.join(' · ')}` : ''
    return `${entry.kind}${pinned}${suffix}`
}

/**
 * An ownership label, not a signature. The tick carries the meaning, so
 * accessible mode drops it and keeps the word.
 */
function describeOfficial(entry: ExtensionListing, manager: ExtensionManager): string {
    if (!entry.official) return ''
    return manager.isAccessible()
        ? manager.officialLabel
        : manager.theme.green(`✓ ${manager.officialLabel}`)
}

/**
 * Pad every column to its widest cell, leaving the last one ragged so a long
 * final value never drags trailing spaces across the terminal.
 *
 * Widths are measured on the text as given. Only the last column is ever
 * coloured, so no escape sequence is ever counted as width.
 */
function alignRows(rows: string[][]): string[] {
    const widths = rows[0].map((_, column) =>
        Math.max(...rows.map((row) => row[column]?.length ?? 0)),
    )
    return rows.map((row) =>
        row
            .map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column])))
            .join('  ')
            .trimEnd(),
    )
}

/** The fields `list --json` promises, with absent ones left out entirely. */
function toJson(entry: ExtensionListing) {
    return {
        name: entry.name,
        dirName: entry.dirName,
        kind: entry.kind,
        // Where the entry sits in the extensions directory, which is what
        // `remove` acts on. For a local install `dir` is the link target, so
        // the two differ.
        path: entry.entryPath,
        dir: entry.dir,
        source: entry.source,
        host: entry.host,
        owner: entry.owner,
        version: entry.version,
        pinned: entry.pinned,
        pinnedRef: entry.pinnedRef,
        official: entry.official,
        executable: entry.executable,
        shadowed: entry.shadowed,
        description: entry.description,
        requires: entry.requires,
        manifestFromNewerFormat: entry.manifestFromNewerFormat,
    }
}

async function listExtensions(
    manager: ExtensionManager,
    options: { json?: boolean },
): Promise<void> {
    const entries = await manager.list()

    if (options.json) {
        console.log(formatJson(entries.map(toJson)))
        return
    }

    if (entries.length === 0) {
        printEmpty({
            options,
            message: `No extensions installed. Run \`${manager.binName} extension install <owner/repo>\` to add one.`,
        })
        return
    }

    const rows = [
        ['NAME', 'SOURCE', 'VERSION', 'KIND', 'OFFICIAL'],
        ...entries.map((entry) => [
            entry.name,
            entry.source ? shorten(entry.source) : NOTHING,
            entry.version ?? NOTHING,
            describeKind(entry, manager.binName),
            describeOfficial(entry, manager),
        ]),
    ]

    const [header, ...body] = alignRows(rows)
    console.log(manager.theme.bold(header))
    for (const line of body) console.log(line)
}

/** `1 extension`, `3 extensions`. */
function count(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? '' : 's'}`
}

async function installExtension(
    manager: ExtensionManager,
    source: string,
    options: { pin?: string; force?: boolean; json?: boolean },
): Promise<void> {
    const result = await manager.install(source, { pin: options.pin, force: options.force })

    if (options.json) {
        console.log(formatJson(result))
        return
    }

    // A local install is a link to a directory the user already had, so say
    // where the link is rather than repeating the directory they gave.
    const destination = shorten(
        result.kind === 'local' ? join(manager.extensionsDir, result.dirName) : result.dir,
    )
    const version = result.version ? ` (${result.version})` : ''
    const verb = result.kind === 'local' ? 'Linked' : 'Installed'
    console.log(
        `${verb} ${result.dirName} from ${shorten(result.source)}${version} to ${destination}`,
    )
}

const OUTCOME_LABELS: Record<UpgradeResult['outcome'], string> = {
    upgraded: 'upgraded',
    'up-to-date': 'up to date',
    skipped: 'skipped',
    'would-upgrade': 'would upgrade',
}

/** What changed, or why nothing did. */
function describeOutcome(result: UpgradeResult): string {
    if (result.from && result.to) return `${result.from} → ${result.to}`
    return result.detail ?? ''
}

async function upgradeExtensions(
    manager: ExtensionManager,
    names: string[],
    options: { all?: boolean; force?: boolean; dryRun?: boolean; json?: boolean },
): Promise<void> {
    if (options.all && names.length > 0) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Name the extensions to upgrade, or pass --all, but not both.',
        )
    }

    const upgradeOptions = { force: options.force, dryRun: options.dryRun }
    const results = options.all
        ? await manager.upgradeAll(upgradeOptions)
        : await manager.upgrade(names, upgradeOptions)

    if (options.json) {
        console.log(formatJson(results))
        return
    }

    if (results.length === 0) {
        console.log('No extensions installed.')
        return
    }

    if (options.dryRun) {
        const changing = results.filter((result) => result.outcome === 'would-upgrade').length
        console.log(
            manager.theme.yellow(`[dry-run] Would upgrade ${count(changing, 'extension')}:`),
        )
    }

    const indent = options.dryRun ? '  ' : ''
    for (const line of alignRows(
        results.map((result) => [
            result.name,
            OUTCOME_LABELS[result.outcome],
            describeOutcome(result),
        ]),
    )) {
        console.log(`${indent}${line}`)
    }

    if (options.dryRun) console.log(manager.theme.dim('Run without --dry-run to execute.'))
}

/** Removing a local install takes the link and leaves the user's own copy. */
function describeRemoval(result: RemoveResult, manager: ExtensionManager): string {
    const path = shorten(join(manager.extensionsDir, `${manager.binName}-${result.name}`))
    return result.removed === 'link'
        ? `Removed the link for ${result.name} at ${path}. Its directory was left alone.`
        : `Removed ${result.name} from ${path}`
}

async function removeExtension(
    manager: ExtensionManager,
    name: string,
    options: { force?: boolean; json?: boolean },
): Promise<void> {
    const result = await manager.remove(name, { force: options.force })
    console.log(options.json ? formatJson(result) : describeRemoval(result, manager))
}

export function registerExtensionGroup(program: Command, manager: ExtensionManager): Command {
    const { binName } = manager

    const extension = program
        .command('extension')
        .alias('ext')
        .description(`Manage ${binName} extensions`)
        .addHelpText(
            'after',
            `
An extension is an executable named \`${binName}-<name>\` that ${binName} runs as
\`${binName} <name> …\`, passing everything after the name through untouched. It can
be written in any language.

${manager.trustWarning}

Examples:
  ${binName} extension install owner/${binName}-goals
  ${binName} extension install .          # a local directory, for development
  ${binName} extension list
  ${binName} extension upgrade --all
  ${binName} extension remove goals`,
        )

    extension
        .command('list')
        .description('List installed extensions')
        .option('--json', 'Output as JSON')
        .action((options) => listExtensions(manager, options))

    extension
        .command('install <source>')
        .description('Install an extension from a repository or a local directory')
        .option('--pin <ref>', 'Install and hold at a release tag or git ref')
        .option('--force', 'Replace an extension that is already installed')
        .option('--json', 'Output as JSON')
        .action((source, options) => installExtension(manager, source, options))

    const upgradeCmd = extension
        .command('upgrade [names...]')
        .description('Upgrade installed extensions')
        .option('--all', 'Upgrade every installed extension')
        .option('--force', 'Upgrade past a pin, and reset a clone that has diverged')
        .option('--dry-run', 'Report what would change without changing it')
        .option('--json', 'Output as JSON')
        .action((names: string[], options) => {
            if (names.length === 0 && !options.all) {
                upgradeCmd.help()
                return
            }
            return upgradeExtensions(manager, names, options)
        })

    extension
        .command('remove <name>')
        .description('Remove an installed extension')
        .option('--force', 'Remove a clone that has uncommitted changes')
        .option('--json', 'Output as JSON')
        .action((name, options) => removeExtension(manager, name, options))

    extension
        .command('exec <name> [args...]')
        .description('Run an extension directly, bypassing the built-in commands')
        // Whatever follows the name belongs to the extension. The arguments
        // are taken from argv rather than from these declarations, which exist
        // so that `--help` describes the shape.
        .allowUnknownOption()
        .allowExcessArguments()
        // `--help` included: an extension that ships its own usage can only be
        // asked for it through here when a built-in command hides its name.
        .helpOption(false)
        .action(async (name: string) => {
            // `require` first, so an unknown name is a clean error rather than
            // a failed spawn.
            const target = await manager.require(name)
            process.exitCode = await manager.dispatch(target.name, argsAfter('exec', name))
        })

    return extension
}

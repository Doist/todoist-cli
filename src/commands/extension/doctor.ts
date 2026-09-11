/**
 * What `td doctor` reports about installed extensions.
 *
 * Nothing here reaches the network: `list` is a directory read plus, for a
 * clone, a `git rev-parse`. Someone with no extensions sees nothing at all.
 */

import type { Command } from 'commander'
import packageJson from '../../../package.json' with { type: 'json' }
import { mapWithConcurrency } from '../../lib/extensions/concurrency.js'
import { findManifestProblems } from '../../lib/extensions/manifest.js'
import { satisfiesRange } from '../../lib/extensions/version-range.js'
import type { DoctorCheck } from '../doctor.js'
import { buildExtensionManager } from './index.js'

const NAME = 'extensions'
const TD_VERSION = packageJson.version

/**
 * Windows paths are implemented but have not had a full test pass, so say so
 * rather than letting someone discover it themselves.
 */
function windowsCheck(): DoctorCheck | null {
    if (process.platform !== 'win32') return null
    return {
        name: NAME,
        status: 'warn',
        message: 'Extensions are experimental on Windows in this release',
        details: { platform: process.platform },
    }
}

export async function checkExtensions(program: Command): Promise<DoctorCheck[]> {
    const manager = buildExtensionManager(program)

    // `list` rather than `isEmpty` first: `isEmpty` answers "yes" for any
    // directory it cannot read, which would make a permissions problem look
    // like having no extensions — exactly the failure this check is for. A
    // directory that is simply not there yields an empty list, not an error.
    let listing: Awaited<ReturnType<typeof manager.list>>
    try {
        listing = await manager.list()
    } catch (error) {
        return [
            {
                name: NAME,
                status: 'fail',
                message: `Cannot read ${manager.extensionsDir}: ${error instanceof Error ? error.message : String(error)}`,
                details: { extensionsDir: manager.extensionsDir },
            },
        ]
    }

    if (listing.length === 0) return []

    // Two file reads per extension, and they do not depend on each other.
    const manifestProblems = await mapWithConcurrency(listing, 4, async (entry) => ({
        entry,
        problems: await findManifestProblems(entry.dir, manager.binName),
    }))

    const checks: DoctorCheck[] = [
        {
            name: NAME,
            status: 'pass',
            message: `${listing.length} extension(s) installed in ${manager.extensionsDir}`,
            details: { count: listing.length, extensionsDir: manager.extensionsDir },
        },
    ]

    for (const { entry, problems } of manifestProblems) {
        const details = { name: entry.name, kind: entry.kind, dir: entry.dir }

        if (!entry.executable) {
            checks.push({
                name: NAME,
                status: 'fail',
                message: `${entry.name}: ${entry.executablePath} is missing or not executable`,
                details,
            })
        }

        if (entry.shadowed) {
            checks.push({
                name: NAME,
                status: 'warn',
                message: `${entry.name} is hidden by the built-in command of the same name. Run \`td extension exec ${entry.name}\`, or reinstall it under another name`,
                details,
            })
        }

        for (const problem of problems) {
            checks.push({
                name: NAME,
                status: 'warn',
                message: `${entry.name}: ${problem}. Fix or delete the file`,
                details,
            })
        }

        const range = entry.requires?.[manager.binName]
        if (range && !satisfiesRange(TD_VERSION, range)) {
            checks.push({
                name: NAME,
                status: 'warn',
                message: `${entry.name} expects td ${range}, but this is td ${TD_VERSION}. Run \`td update\`, or \`td extension upgrade ${entry.name}\``,
                details: { ...details, requires: range },
            })
        }

        if (entry.manifestFromNewerFormat) {
            checks.push({
                name: NAME,
                status: 'warn',
                message: `${entry.name} declares a manifest format newer than this td understands, so some of its metadata is being ignored. Run \`td update\``,
                details,
            })
        }
    }

    const windows = windowsCheck()
    if (windows) checks.push(windows)

    return checks
}

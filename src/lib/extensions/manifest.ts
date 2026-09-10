/**
 * Reading and writing the two manifest files.
 *
 * `<bin>-extension.json` is written by the extension author and is optional.
 * `.<bin>-manifest.json` is written by the CLI for binary installs, which have
 * no repository on disk to read the authored file from. The CLI-written file is
 * dot-prefixed so it cannot collide with anything the extension itself ships.
 */

import { join } from 'node:path'
import { isRecord, readJsonFile, readJsonValue, writeJsonFile } from './json-file.js'
import { authoredManifestFileName, manifestFileName } from './source.js'
import type { AuthoredManifest, InstalledManifest } from './types.js'

/**
 * The manifest format this CLI writes and knows how to read in full.
 *
 * A file without a version is this one: the field was introduced with the
 * format, so its absence can only mean the first version.
 */
export const MANIFEST_VERSION = 1

/** The version a manifest declares, defaulting to the original format. */
export function manifestVersionOf(manifest: AuthoredManifest | undefined): number {
    return manifest?.manifestVersion ?? MANIFEST_VERSION
}

/**
 * True when a manifest was written to a format newer than this CLI knows.
 *
 * Such a manifest is still read for the fields this version understands. The
 * extension itself is an executable and runs regardless: refusing to run it
 * over the shape of a metadata file would break a working extension on a CLI
 * downgrade, which is the failure the `requires` warning already avoids.
 */
export function isFromNewerFormat(manifest: AuthoredManifest | undefined): boolean {
    return manifestVersionOf(manifest) > MANIFEST_VERSION
}

/**
 * Take only the fields this system understands, and only when they are the
 * right type. A manifest is written by hand, so a wrong type is likelier than
 * a missing field and neither should stop an extension from working.
 */
export function pickAuthoredFields(value: unknown): AuthoredManifest | undefined {
    if (!isRecord(value)) return undefined
    const manifest: AuthoredManifest = {}
    // Kept whatever it says, including a version this CLI does not know, so
    // callers can tell the user why some of the metadata was ignored.
    if (typeof value.manifestVersion === 'number' && Number.isInteger(value.manifestVersion)) {
        manifest.manifestVersion = value.manifestVersion
    }
    if (typeof value.description === 'string') manifest.description = value.description
    if (isRecord(value.requires)) {
        const requires: Record<string, string> = {}
        for (const [key, range] of Object.entries(value.requires)) {
            if (typeof range === 'string') requires[key] = range
        }
        if (Object.keys(requires).length > 0) manifest.requires = requires
    }
    if (typeof value.completion === 'boolean') manifest.completion = value.completion
    return manifest
}

/**
 * Author metadata for an extension, from `<bin>-extension.json` or, for Node
 * extensions that would rather not carry a second file, the `<bin>` key of
 * `package.json`. The dedicated file wins when both exist.
 */
export async function readAuthoredManifest(
    dir: string,
    binName: string,
): Promise<AuthoredManifest | undefined> {
    const dedicated = pickAuthoredFields(
        await readJsonValue(join(dir, authoredManifestFileName(binName))),
    )
    if (dedicated) return dedicated

    const packageJson = await readJsonValue(join(dir, 'package.json'))
    if (!isRecord(packageJson)) return undefined
    return pickAuthoredFields(packageJson[binName])
}

/**
 * The manifest the CLI wrote at install time, or undefined when it is missing
 * or does not describe an install.
 *
 * Every required field is checked rather than cast over, because upgrades read
 * `tag` and `owner` back to decide what to fetch: a truncated or hand-edited
 * file should read as "no manifest", which callers already handle, rather than
 * as a manifest full of undefined.
 */
export async function readInstalledManifest(
    dir: string,
    binName: string,
): Promise<InstalledManifest | undefined> {
    const value = await readJsonValue(join(dir, manifestFileName(binName)))
    if (!isRecord(value)) return undefined

    const strings = ['owner', 'name', 'host', 'tag', 'asset', 'installedAt'] as const
    if (strings.some((field) => typeof value[field] !== 'string')) return undefined
    if (typeof value.pinned !== 'boolean') return undefined
    if (value.sha256 !== undefined && typeof value.sha256 !== 'string') return undefined

    // This file is written by the CLI, so a version it does not recognise
    // means a newer CLI wrote it. Reading it as though it were this format
    // would be guessing; treating it as absent makes callers say the
    // extension needs reinstalling, which is the truth.
    if (typeof value.manifestVersion === 'number' && value.manifestVersion > MANIFEST_VERSION) {
        return undefined
    }

    return {
        owner: value.owner as string,
        name: value.name as string,
        host: value.host as string,
        tag: value.tag as string,
        asset: value.asset as string,
        installedAt: value.installedAt as string,
        pinned: value.pinned,
        sha256: value.sha256 as string | undefined,
        ...pickAuthoredFields(value),
    }
}

export async function writeInstalledManifest(
    dir: string,
    binName: string,
    manifest: InstalledManifest,
): Promise<void> {
    await writeJsonFile(join(dir, manifestFileName(binName)), manifest)
}

/**
 * Manifest problems worth reporting in `doctor`: a file that is there but
 * cannot be read or parsed, or that parses to something other than an object.
 * A missing file is not a problem — both manifests are optional — but a file
 * that exists and cannot be read is exactly what `doctor` is for.
 */
export async function findManifestProblems(dir: string, binName: string): Promise<string[]> {
    const problems: string[] = []

    for (const fileName of [authoredManifestFileName(binName), manifestFileName(binName)]) {
        const result = await readJsonFile(join(dir, fileName))
        if (result.status === 'absent') continue
        if (result.status === 'unreadable') {
            problems.push(`${fileName} could not be read: ${result.reason}`)
            continue
        }
        if (!isRecord(result.value)) problems.push(`${fileName} is not a JSON object`)
    }

    return problems
}

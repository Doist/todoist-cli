/**
 * Reading and writing the two manifest files.
 *
 * `<bin>-extension.json` is written by the extension author and is optional.
 * `.<bin>-manifest.json` is written by the CLI for binary installs, which have
 * no repository on disk to read the authored file from. The CLI-written file is
 * dot-prefixed so it cannot collide with anything the extension itself ships.
 *
 * Validation lives in `schemas.ts`, which is imported only when a file is
 * actually parsed: discovery runs on every invocation of the CLI, and most of
 * those invocations never touch a manifest.
 */

import { join } from 'node:path'
import { isRecord, readJsonFile, readJsonValue, writeJsonFile } from './json-file.js'
import { authoredManifestFileName, manifestFileName } from './source.js'
import type { AuthoredManifest, InstalledManifest } from './types.js'

/** The manifest format this CLI writes and knows how to read in full. */
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

async function schemas() {
    return import('./schemas.js')
}

/** Validate a value that is already in hand, such as one fetched over HTTP. */
export async function pickAuthoredFields(value: unknown): Promise<AuthoredManifest | undefined> {
    return (await schemas()).parseAuthoredManifest(value)
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
    const dedicatedValue = await readJsonValue(join(dir, authoredManifestFileName(binName)))
    const packageJson =
        dedicatedValue === undefined ? await readJsonValue(join(dir, 'package.json')) : undefined

    // Nothing to validate, so nothing to load a validator for.
    if (dedicatedValue === undefined && !isRecord(packageJson)) return undefined

    const { parseAuthoredManifest } = await schemas()
    if (dedicatedValue !== undefined) {
        const dedicated = parseAuthoredManifest(dedicatedValue)
        if (dedicated) return dedicated
    }
    return isRecord(packageJson) ? parseAuthoredManifest(packageJson[binName]) : undefined
}

/**
 * The manifest the CLI wrote at install time, or undefined when it is missing
 * or does not describe an install this version can read.
 */
export async function readInstalledManifest(
    dir: string,
    binName: string,
): Promise<InstalledManifest | undefined> {
    const value = await readJsonValue(join(dir, manifestFileName(binName)))
    if (value === undefined) return undefined
    return (await schemas()).parseInstalledManifest(value)
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

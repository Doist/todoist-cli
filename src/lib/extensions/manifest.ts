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

async function schemas() {
    return import('./schemas.js')
}

/** Validate a value that is already in hand, such as one fetched over HTTP. */
export async function pickAuthoredFields(value: unknown): Promise<AuthoredManifest | undefined> {
    return (await schemas()).parseAuthoredManifest(value)
}

/**
 * The fields that carry meaning. `manifestVersion` is deliberately not one of
 * them: it says which format a file is written in, not what the file has to
 * say, and a file carrying nothing else has told this version of the CLI
 * nothing it can use.
 */
const CONTENT_FIELDS = ['description', 'requires', 'completion'] as const

function saysSomething(manifest: AuthoredManifest | undefined): boolean {
    return manifest !== undefined && CONTENT_FIELDS.some((field) => manifest[field] !== undefined)
}

/**
 * Author metadata for an extension, from `<bin>-extension.json` or, for Node
 * extensions that would rather not carry a second file, the `<bin>` key of
 * `package.json`.
 *
 * The dedicated file wins whenever it says anything this version understands.
 * When it does not — the shape a file written for a later format takes, since
 * every key it carries but the version marker is stripped here — the
 * `package.json` metadata is used instead, rather than being shadowed by a
 * file that turned out to be empty. The version marker survives that fall
 * back, so `list` and `doctor` still report that some of the metadata is from
 * a format this version cannot read.
 */
export async function readAuthoredManifest(
    dir: string,
    binName: string,
): Promise<AuthoredManifest | undefined> {
    const dedicatedValue = await readJsonValue(join(dir, authoredManifestFileName(binName)))
    const dedicated =
        dedicatedValue === undefined ? undefined : await pickAuthoredFields(dedicatedValue)

    if (saysSomething(dedicated)) return dedicated

    const packageJson = await readJsonValue(join(dir, 'package.json'))
    // Nothing left to validate, so nothing to load a validator for.
    if (!isRecord(packageJson)) return dedicated

    const fromPackage = await pickAuthoredFields(packageJson[binName])
    if (!saysSomething(fromPackage)) return dedicated ?? fromPackage

    return dedicated?.manifestVersion === undefined
        ? fromPackage
        : { ...fromPackage, manifestVersion: dedicated.manifestVersion }
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

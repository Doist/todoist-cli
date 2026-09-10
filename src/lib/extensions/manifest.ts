/**
 * Reading and writing the two manifest files.
 *
 * `<bin>-extension.json` is written by the extension author and is optional.
 * `.<bin>-manifest.json` is written by the CLI for binary installs, which have
 * no repository on disk to read the authored file from. The CLI-written file is
 * dot-prefixed so it cannot collide with anything the extension itself ships.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { authoredManifestFileName, manifestFileName } from './source.js'
import type { AuthoredManifest, InstalledManifest } from './types.js'

async function readJson(path: string): Promise<unknown | undefined> {
    let raw: string
    try {
        raw = await readFile(path, 'utf8')
    } catch {
        return undefined
    }
    try {
        return JSON.parse(raw)
    } catch {
        return undefined
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickAuthoredFields(value: unknown): AuthoredManifest | undefined {
    if (!isRecord(value)) return undefined
    const manifest: AuthoredManifest = {}
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
        await readJson(join(dir, authoredManifestFileName(binName))),
    )
    if (dedicated) return dedicated

    const packageJson = await readJson(join(dir, 'package.json'))
    if (!isRecord(packageJson)) return undefined
    return pickAuthoredFields(packageJson[binName])
}

export async function readInstalledManifest(
    dir: string,
    binName: string,
): Promise<InstalledManifest | undefined> {
    const value = await readJson(join(dir, manifestFileName(binName)))
    if (!isRecord(value)) return undefined
    if (typeof value.name !== 'string' || typeof value.owner !== 'string') return undefined
    return value as InstalledManifest
}

export async function writeInstalledManifest(
    dir: string,
    binName: string,
    manifest: InstalledManifest,
): Promise<void> {
    await writeFile(
        join(dir, manifestFileName(binName)),
        `${JSON.stringify(manifest, null, 2)}\n`,
        {
            mode: 0o600,
        },
    )
}

/**
 * Manifest problems worth reporting in `doctor`: a file that exists but does
 * not parse, or parses to something that is not an object. Missing files are
 * not a problem — both manifests are optional.
 */
export async function findManifestProblems(dir: string, binName: string): Promise<string[]> {
    const problems: string[] = []
    for (const fileName of [authoredManifestFileName(binName), manifestFileName(binName)]) {
        const path = join(dir, fileName)
        let raw: string
        try {
            raw = await readFile(path, 'utf8')
        } catch {
            continue
        }
        try {
            const parsed: unknown = JSON.parse(raw)
            if (!isRecord(parsed)) problems.push(`${fileName} is not a JSON object`)
        } catch {
            problems.push(`${fileName} is not valid JSON`)
        }
    }
    return problems
}

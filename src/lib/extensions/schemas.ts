/**
 * The shape of every file the extension system reads.
 *
 * Schemas rather than hand-written checks, because two of these files are
 * written by people: an author's manifest comes from a repository this CLI
 * does not control, and the state file sits in a directory the user can edit.
 * One schema per file gives the type and the validation together, so they
 * cannot drift.
 *
 * This module is the only place that imports zod, and it is only ever loaded
 * through a dynamic import, when a file actually needs parsing. Discovery runs
 * on every invocation of the CLI, and importing a validation library on the
 * way to `--version` would be a cost paid by everyone for nothing. The types
 * are re-exported elsewhere with `import type`, which TypeScript erases, so
 * naming one never drags zod into the startup path.
 */

import { z } from 'zod'

/**
 * The manifest format this CLI writes and knows how to read in full.
 *
 * A file without a version is this one: the field arrived with the format, so
 * its absence can only mean the first version.
 */
export const MANIFEST_VERSION = 1

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Version ranges keyed by binary name, e.g. `{ td: '>=4.0.0' }`.
 *
 * Entries that are not strings are dropped rather than failing the whole
 * field: one malformed entry should not cost the extension a requirement it
 * expressed correctly for another CLI.
 */
const requiresSchema = z
    .preprocess(
        (value) =>
            isPlainObject(value)
                ? Object.fromEntries(
                      Object.entries(value).filter(([, range]) => typeof range === 'string'),
                  )
                : value,
        z.record(z.string(), z.string()),
    )
    // An empty map asks for nothing, so it is not worth carrying.
    .transform((requires) => (Object.keys(requires).length > 0 ? requires : undefined))

/**
 * Unknown keys are dropped rather than rejected, which is what lets the format
 * grow: an extension written for a later CLI still reads correctly here, minus
 * the parts this version has no meaning for.
 */
const authoredManifestSchema = z.object({
    manifestVersion: z.int().positive().optional(),
    description: z.string().optional(),
    requires: requiresSchema.optional(),
    /** Opt-in to the argument-completion protocol. Unused for now. */
    completion: z.boolean().optional(),
})

/**
 * Written by the CLI for binary installs, and read back to decide what to
 * fetch on an upgrade, so every field it promises has to be there.
 */
const installedManifestSchema = authoredManifestSchema.extend({
    owner: z.string().min(1),
    /** Directory name, e.g. `td-goals`. */
    name: z.string().min(1),
    host: z.string().min(1),
    tag: z.string().min(1),
    pinned: z.boolean(),
    asset: z.string().min(1),
    sha256: z.string().optional(),
    installedAt: z.string().min(1),
})

/** Bookkeeping the CLI keeps beside an extension, all of it optional. */
const extensionStateSchema = z.object({
    /** Git ref or release tag this extension is held at, if pinned. */
    pinned: z.string().optional(),
    checkedForUpdateAt: z.string().optional(),
    latestRelease: z.string().optional(),
})

export type AuthoredManifest = z.infer<typeof authoredManifestSchema>
export type InstalledManifest = z.infer<typeof installedManifestSchema>
export type ExtensionState = z.infer<typeof extensionStateSchema>

/**
 * Take the fields the schema describes and drop everything else.
 *
 * Both manifests are hand-written, so a wrong type is likelier than a missing
 * field, and neither should stop an extension from working. When the whole
 * object does not validate, each field is tried on its own, so one bad entry
 * does not discard an otherwise usable manifest.
 */
function pickValid<T extends z.ZodObject>(schema: T, value: unknown): z.infer<T> | undefined {
    if (!isPlainObject(value)) return undefined

    const parsed = schema.safeParse(value)
    if (parsed.success) return parsed.data

    const kept: Record<string, unknown> = {}
    for (const [key, fieldSchema] of Object.entries(schema.shape)) {
        const field = (fieldSchema as z.ZodType).safeParse(value[key])
        if (field.success && field.data !== undefined) kept[key] = field.data
    }
    return kept as z.infer<T>
}

export function parseAuthoredManifest(value: unknown): AuthoredManifest | undefined {
    return pickValid(authoredManifestSchema, value)
}

/**
 * Strict, unlike the authored manifest: this file is the CLI's own record, so
 * a shape it does not recognise means a different version of the CLI wrote it,
 * and reading it anyway would be guessing.
 */
export function parseInstalledManifest(value: unknown): InstalledManifest | undefined {
    const parsed = installedManifestSchema.safeParse(value)
    if (!parsed.success) return undefined
    if ((parsed.data.manifestVersion ?? MANIFEST_VERSION) > MANIFEST_VERSION) return undefined
    return parsed.data
}

export function parseExtensionState(value: unknown): ExtensionState {
    return pickValid(extensionStateSchema, value) ?? {}
}

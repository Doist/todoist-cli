/**
 * Which version of the manifest format this CLI speaks.
 *
 * This has a module of its own because the two places that need it cannot
 * share either of themselves. The schemas define the format, but they live
 * behind a dynamic import so that a validation library never loads on the way
 * to `<bin> --version`; discovery, meanwhile, asks whether a manifest comes
 * from a newer format while building a listing, and needs the answer without
 * awaiting anything. One definition here, imported by both, so the number
 * cannot be raised in one place and left behind in the other.
 */

import type { AuthoredManifest } from './schemas.js'

/**
 * The format this CLI writes and knows how to read in full.
 *
 * A file without a version is this one: the field arrived with the format, so
 * its absence can only mean the first version.
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

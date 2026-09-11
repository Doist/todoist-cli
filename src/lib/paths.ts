/**
 * Per-user directories that are not the config directory.
 *
 * `@doist/cli-core` owns `getConfigPath`, but has no equivalent for data or
 * state, so they are resolved here in the same shape: the XDG variable first,
 * the platform default second.
 *
 * Everything is computed on each call rather than cached at module load, for
 * the same reason `getConfigPath` is (see `config.ts`): a cached value freezes
 * the home directory before a test has had a chance to point it somewhere
 * harmless.
 */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { APP_NAME } from './app-name.js'

/**
 * Windows has no XDG equivalent. `LOCALAPPDATA` is set on every supported
 * version, but it is an ordinary environment variable and can be missing from
 * a stripped-down service environment, so the documented default stands in.
 */
function windowsBase(): string {
    return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
}

/**
 * The XDG spec requires these variables to hold absolute paths and says a
 * relative one must be ignored. Honouring a relative value would tie the
 * extensions directory to whichever directory `td` happened to be started
 * from, so an extension installed in one place would be invisible from
 * another.
 */
function xdgBase(value: string | undefined): string | undefined {
    return value && isAbsolute(value) ? value : undefined
}

/**
 * Where installed extensions live, under an `extensions` subdirectory.
 *
 * macOS gets the XDG layout rather than `~/Library/Application Support`,
 * because cli-core already puts the config at `~/.config` there and splitting
 * the two would leave a user's files in two unrelated places.
 */
export function getDataDir(): string {
    const xdg = xdgBase(process.env.XDG_DATA_HOME)
    if (xdg) return join(xdg, APP_NAME)
    if (process.platform === 'win32') return join(windowsBase(), APP_NAME)
    return join(homedir(), '.local', 'share', APP_NAME)
}

/**
 * Bookkeeping the CLI can regenerate: pins, update checks. Separate from the
 * data directory so that deleting it loses nothing a user authored.
 *
 * Windows has no state root distinct from its data root, so it nests. That
 * cannot collide with the extensions directory, which is a sibling.
 */
export function getStateDir(): string {
    const xdg = xdgBase(process.env.XDG_STATE_HOME)
    if (xdg) return join(xdg, APP_NAME)
    if (process.platform === 'win32') return join(windowsBase(), APP_NAME, 'state')
    return join(homedir(), '.local', 'state', APP_NAME)
}

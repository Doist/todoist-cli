/**
 * Dependency installation for extensions that ship a `package.json`.
 *
 * Lifecycle scripts are allowed to run: packages with native dependencies need
 * them, and by the time this runs the user has already been shown the trust
 * warning and chosen to install code from this publisher.
 */

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { CliError } from '@doist/cli-core'
import { outputHints, run } from './run.js'

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

export async function hasPackageJson(dir: string): Promise<boolean> {
    return exists(join(dir, 'package.json'))
}

const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * Install production dependencies in place. Uses `npm ci` when a lockfile is
 * present and falls back to `npm install` when it is not.
 */
export async function installDependencies(dir: string): Promise<void> {
    if (!(await hasPackageJson(dir))) return

    const hasLockfile = await exists(join(dir, 'package-lock.json'))
    const args = hasLockfile ? ['ci', '--omit=dev'] : ['install', '--omit=dev']
    const result = await run(NPM_COMMAND, args, { cwd: dir })

    if (result.missing) {
        throw new CliError(
            'EXTENSION_NPM_MISSING',
            'This extension has dependencies but npm was not found on PATH.',
            {
                hints: [
                    'Install npm, then run the install again.',
                    'Extension authors can avoid this by vendoring dependencies or shipping a release binary.',
                ],
            },
        )
    }

    if (result.code !== 0) {
        throw new CliError(
            'EXTENSION_INSTALL_FAILED',
            "Could not install the extension's dependencies.",
            { hints: outputHints(result) },
        )
    }
}

/**
 * Dependency installation for extensions that ship a `package.json`.
 *
 * Lifecycle scripts are allowed to run: packages with native dependencies need
 * them, and by the time this runs the user has already been shown the trust
 * warning and chosen to install code from this publisher. Those scripts are
 * third-party code that the user never chose directly, though, so they run
 * without the credentials the CLI itself uses.
 */

import { join } from 'node:path'
import { CliError } from '@doist/cli-core'
import { exists } from './fs-utils.js'
import { outputHints, run } from './run.js'

export async function hasPackageJson(dir: string): Promise<boolean> {
    return exists(join(dir, 'package.json'))
}

/**
 * Variables removed before running npm. A denylist rather than an allowlist:
 * npm legitimately needs a large and open-ended slice of the environment
 * (proxies, certificate bundles, registry credentials, package-manager
 * settings), so naming what must not travel is both safer in practice and
 * easier to keep correct than naming everything that may.
 */
const SECRET_ENV_VARS = ['TODOIST_API_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']

function environmentWithoutSecrets(): NodeJS.ProcessEnv {
    const env = { ...process.env }
    for (const name of SECRET_ENV_VARS) delete env[name]
    return env
}

/**
 * How to invoke npm on this platform.
 *
 * On Windows npm is a `.cmd` shim, and since Node's fix for CVE-2024-27980 a
 * `.cmd` file cannot be spawned directly — it has to go through the command
 * interpreter, which this CLI's supported Node versions all enforce.
 */
function npmCommand(): { command: string; prefix: string[] } {
    return process.platform === 'win32'
        ? { command: process.env.ComSpec ?? 'cmd.exe', prefix: ['/d', '/s', '/c', 'npm'] }
        : { command: 'npm', prefix: [] }
}

/**
 * Install production dependencies in place. Uses `npm ci` when a lockfile is
 * present. Without one it falls back to `npm install --no-package-lock`: the
 * clone is a git working tree, and writing a lockfile into it would leave the
 * extension looking modified for every later `remove` and `upgrade`.
 */
export async function installDependencies(dir: string): Promise<void> {
    if (!(await hasPackageJson(dir))) return

    const hasLockfile = await exists(join(dir, 'package-lock.json'))
    const args = hasLockfile ? ['ci', '--omit=dev'] : ['install', '--omit=dev', '--no-package-lock']
    const { command, prefix } = npmCommand()
    const result = await run(command, [...prefix, ...args], {
        cwd: dir,
        env: environmentWithoutSecrets(),
    })

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

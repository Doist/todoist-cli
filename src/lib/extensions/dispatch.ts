/**
 * Running an extension.
 *
 * The contract is the process boundary: arguments are passed through exactly
 * as the user typed them, the three standard streams are the host's own, and
 * the host exits with whatever the extension exited with. Nothing is parsed,
 * rewritten or added on either side.
 */

import { spawn } from 'node:child_process'
import { open, stat } from 'node:fs/promises'
import { constants } from 'node:os'
import { CliError } from '@doist/cli-core'
import type { DispatchOptions, Extension } from './types.js'

export type SpawnPlan = { command: string; args: string[] }

/** First line of a file, when it is a shebang. */
async function readShebang(path: string): Promise<string | undefined> {
    let handle: Awaited<ReturnType<typeof open>>
    try {
        handle = await open(path, 'r')
    } catch {
        return undefined
    }
    try {
        const buffer = Buffer.alloc(256)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        const head = buffer.subarray(0, bytesRead).toString('utf8')
        if (!head.startsWith('#!')) return undefined
        return head.split('\n', 1)[0].trim()
    } finally {
        await handle.close()
    }
}

async function isExecutable(path: string): Promise<boolean> {
    try {
        const stats = await stat(path)
        if (!stats.isFile()) return false
        // Windows has no executable bit; existence is the only signal there.
        return process.platform === 'win32' ? true : (stats.mode & 0o111) !== 0
    } catch {
        return false
    }
}

/**
 * Decide how to launch an extension's executable.
 *
 * Node scripts are launched with the host's own Node rather than through the
 * shebang, which makes them work on Windows and pins them to the Node version
 * the host already requires. Everything else runs directly on POSIX, and
 * through `sh` on Windows, where shebangs mean nothing.
 */
export async function buildSpawnPlan(executablePath: string, args: string[]): Promise<SpawnPlan> {
    const onWindows = process.platform === 'win32'

    if (!(await isExecutable(executablePath))) {
        throw new CliError(
            'EXTENSION_NOT_EXECUTABLE',
            `The executable for this extension is missing or not executable: ${executablePath}`,
            {
                hints: [
                    'Compiled extensions need building after a source install.',
                    'Script extensions need an executable bit: chmod +x the file.',
                ],
            },
        )
    }

    if (onWindows && /\.(exe|cmd|bat)$/i.test(executablePath)) {
        return { command: executablePath, args }
    }

    const shebang = await readShebang(executablePath)
    if (shebang && /\bnode\b/.test(shebang)) {
        return { command: process.execPath, args: [executablePath, ...args] }
    }

    if (onWindows) {
        // Matches how `gh` runs script extensions on Windows: Git for Windows
        // provides the interpreter, and without it a shebang script cannot run.
        return {
            command: 'sh',
            args: ['-c', '"$0" "$@"', executablePath, ...args],
        }
    }

    return { command: executablePath, args }
}

export type ExtensionEnvOptions = {
    envPrefix: string
    version: string
    configDir: string
    hostPath: string
    extension: Extension
    user?: string
    accessible?: boolean
    extra?: Record<string, string | undefined>
}

/**
 * The variables an extension can rely on. The API token is deliberately not
 * among them: an extension that needs it runs `<bin> auth token view`, which
 * keeps the secret out of the environment of every process it starts.
 */
export function buildExtensionEnv(options: ExtensionEnvOptions): NodeJS.ProcessEnv {
    const { envPrefix: prefix, extension } = options
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        [`${prefix}_EXTENSION`]: '1',
        [`${prefix}_EXTENSION_NAME`]: extension.name,
        [`${prefix}_EXTENSION_DIR`]: extension.dir,
        [`${prefix}_PATH`]: options.hostPath,
        [`${prefix}_NODE`]: process.execPath,
        [`${prefix}_VERSION`]: options.version,
        [`${prefix}_CONFIG_DIR`]: options.configDir,
    }

    if (options.user) env[`${prefix}_USER`] = options.user
    if (options.accessible) env[`${prefix}_ACCESSIBLE`] = '1'

    for (const [key, value] of Object.entries(options.extra ?? {})) {
        if (value === undefined) delete env[key]
        else env[key] = value
    }

    return env
}

/** Exit code convention for a child killed by a signal, as the shell reports it. */
function exitCodeForSignal(signal: NodeJS.Signals): number {
    const number = (constants.signals as Record<string, number | undefined>)[signal]
    return number === undefined ? 1 : 128 + number
}

/** Run an extension to completion and return the code the host should exit with. */
export async function dispatchExtension(
    extension: Extension,
    args: string[],
    env: NodeJS.ProcessEnv,
    _options: DispatchOptions = {},
): Promise<number> {
    const plan = await buildSpawnPlan(extension.executablePath, args)

    return new Promise((resolve, reject) => {
        const child = spawn(plan.command, plan.args, {
            cwd: process.cwd(),
            env,
            stdio: 'inherit',
        })

        child.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT' && plan.command === 'sh') {
                reject(
                    new CliError(
                        'EXTENSION_NEEDS_SHELL',
                        `Running "${extension.name}" needs a POSIX shell, which was not found.`,
                        { hints: ['Install Git for Windows, which provides sh.exe.'] },
                    ),
                )
                return
            }
            reject(
                new CliError(
                    'EXTENSION_NOT_EXECUTABLE',
                    `Could not run "${extension.name}": ${error.message}`,
                ),
            )
        })

        child.on('close', (code, signal) => {
            resolve(signal ? exitCodeForSignal(signal) : (code ?? 0))
        })
    })
}

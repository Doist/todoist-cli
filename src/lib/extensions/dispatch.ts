/**
 * Running an extension.
 *
 * The contract is the process boundary: arguments are passed through exactly
 * as the user typed them, the three standard streams are the host's own, and
 * the host exits with whatever the extension exited with. Nothing is parsed,
 * rewritten or added on either side.
 */

import { spawn } from 'node:child_process'
import { open } from 'node:fs/promises'
import { constants } from 'node:os'
import { CliError } from '@doist/cli-core'
import { isExecutable } from './fs-utils.js'
import type { DispatchOptions, Extension } from './types.js'

export type SpawnPlan = {
    command: string
    args: string[]
    /**
     * Hand `args` to the child exactly as written, without Node's own quoting.
     * Only the Windows batch path sets it, where the quoting has to be done
     * for `cmd.exe` rather than for a program's argv.
     */
    verbatim?: boolean
}

type ExecutableHead = {
    /** The shebang line, when there is one. */
    shebang?: string
    isFile: boolean
}

/**
 * Ask both questions about the executable through one open: is it a file, and
 * how does it want to be run. Two separate calls would also leave a window in
 * which the file could change between them.
 */
async function readExecutableHead(path: string): Promise<ExecutableHead> {
    let handle: Awaited<ReturnType<typeof open>>
    try {
        handle = await open(path, 'r')
    } catch {
        return { isFile: false }
    }
    try {
        const stats = await handle.stat()
        if (!stats.isFile()) return { isFile: false }

        const buffer = Buffer.alloc(256)
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        const head = buffer.subarray(0, bytesRead).toString('utf8')
        if (!head.startsWith('#!')) return { isFile: true }
        return { isFile: true, shebang: head.split('\n', 1)[0].trim() }
    } finally {
        await handle.close()
    }
}

/**
 * Node options carried by a shebang, which have to survive the switch to the
 * host's own Node. `#!/usr/bin/env -S node --conditions=development` means the
 * script needs that option to resolve its imports at all.
 */
function nodeShebangOptions(shebang: string): string[] | undefined {
    const words = shebang.replace(/^#!/, '').trim().split(/\s+/)
    let index = 0

    if (/(^|\/)env$/.test(words[index] ?? '')) {
        index += 1
        // `env -S` packs the rest of the line into one argument on systems that
        // would otherwise pass it whole.
        while (words[index] === '-S' || words[index] === '--split-string') index += 1
    }

    if (!/(^|\/)node(\.exe)?$/.test(words[index] ?? '')) return undefined
    return words.slice(index + 1)
}

/**
 * Decide how to launch an extension's executable.
 *
 * Node scripts are launched with the host's own Node rather than through the
 * shebang, which makes them work on Windows and pins them to the Node version
 * the host already requires. Everything else runs directly on POSIX, and
 * through `sh` on Windows, where shebangs mean nothing.
 */
/**
 * Characters `cmd.exe` expands from inside a quoted string, so quoting is not
 * enough to make them safe. `%` performs variable substitution, and `!` does
 * too once delayed expansion is on, which a batch file can turn on for itself.
 */
const CMD_UNQUOTABLE = /[%!\r\n]/

/**
 * Build the single command line `cmd.exe` is given for a batch extension.
 *
 * This cannot go through Node's argument handling. Node quotes an argument
 * only when it contains a space, so `&whoami` would arrive unquoted and
 * `cmd.exe` would read the `&` as a command separator and run it. Quoting
 * every argument here, and refusing the two characters quoting cannot contain,
 * is what keeps an argument an argument.
 *
 * Following Rust's standard library, which refuses rather than pretends: there
 * is no escape for `%` that holds in every context a batch file can create.
 */
function buildCmdLine(executablePath: string, args: string[]): string {
    return [executablePath, ...args].map(quoteForCmd).join(' ')
}

function quoteForCmd(value: string): string {
    if (CMD_UNQUOTABLE.test(value)) {
        throw new CliError(
            'EXTENSION_NOT_EXECUTABLE',
            'An argument to a .cmd or .bat extension contains a character the Windows command interpreter would expand.',
            {
                hints: [
                    'Remove any %, ! or newline from the argument.',
                    'A .exe or a script with a node shebang takes its arguments unchanged.',
                ],
            },
        )
    }
    // Backslashes are literal except when they precede the closing quote, where
    // they would escape it, so those runs are doubled.
    return `"${value.replace(/(\\*)$/, '$1$1').replace(/"/g, '""')}"`
}

export async function buildSpawnPlan(executablePath: string, args: string[]): Promise<SpawnPlan> {
    const onWindows = process.platform === 'win32'
    const head = await readExecutableHead(executablePath)

    if (!head.isFile || !(await isExecutable(executablePath))) {
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

    if (onWindows && /\.exe$/i.test(executablePath)) {
        return { command: executablePath, args }
    }

    if (onWindows && /\.(cmd|bat)$/i.test(executablePath)) {
        // A batch file is not a program: only the command interpreter can run
        // one, and spawning it directly fails on every supported Node version.
        return {
            command: process.env.ComSpec ?? 'cmd.exe',
            args: ['/d', '/s', '/c', buildCmdLine(executablePath, args)],
            verbatim: true,
        }
    }

    const nodeOptions = head.shebang ? nodeShebangOptions(head.shebang) : undefined
    if (nodeOptions) {
        return { command: process.execPath, args: [...nodeOptions, executablePath, ...args] }
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

export type ExtensionEnvOptions = DispatchOptions & {
    envPrefix: string
    version: string
    configDir: string
    hostPath: string
    extension: Extension
    accessible?: boolean
}

/**
 * The variables an extension can rely on, layered onto the environment the
 * user already has.
 *
 * The CLI never reads the credential store on an extension's behalf, so no
 * token is ever injected here: an extension that needs one runs
 * `<bin> auth token view`. A token the user has themselves exported stays in
 * the environment, as every other variable does — the CLI does not inject
 * secrets, but neither does it scrub the environment its user chose.
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

    // Set or cleared, never left as inherited: a nested call without --user
    // must not act as the account the outer call chose.
    if (options.user) env[`${prefix}_USER`] = options.user
    else delete env[`${prefix}_USER`]

    if (options.accessible) env[`${prefix}_ACCESSIBLE`] = '1'

    for (const [key, value] of Object.entries(options.env ?? {})) {
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
): Promise<number> {
    const plan = await buildSpawnPlan(extension.executablePath, args)

    return new Promise((resolve, reject) => {
        const child = spawn(plan.command, plan.args, {
            cwd: process.cwd(),
            env,
            stdio: 'inherit',
            windowsVerbatimArguments: plan.verbatim,
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

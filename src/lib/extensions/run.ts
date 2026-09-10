/**
 * A small wrapper around `spawn` for the helper programs the extension system
 * shells out to (git, npm). It captures output instead of inheriting the
 * terminal, and it never throws on a non-zero exit — callers decide what a
 * failure means and which error code to surface.
 *
 * Dispatching an extension itself is a different job and lives in `dispatch.ts`.
 */

import { spawn } from 'node:child_process'

export type RunResult = {
    code: number
    stdout: string
    stderr: string
    /** True when the program itself could not be found on PATH. */
    missing: boolean
}

export type RunOptions = {
    cwd?: string
    env?: NodeJS.ProcessEnv
}

export async function run(
    command: string,
    args: string[],
    options: RunOptions = {},
): Promise<RunResult> {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString()
        })
        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString()
        })

        child.on('error', (error: NodeJS.ErrnoException) => {
            resolve({
                code: 127,
                stdout,
                stderr: stderr || error.message,
                missing: error.code === 'ENOENT',
            })
        })

        child.on('close', (code) => {
            resolve({ code: code ?? 1, stdout, stderr, missing: false })
        })
    })
}

/** The last few lines of a failed command's output, for use as error hints. */
export function outputHints(result: RunResult, limit = 4): string[] {
    return `${result.stderr}\n${result.stdout}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-limit)
}

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

/**
 * How much of each stream to keep. Callers only ever read the last few lines,
 * and `npm install` deliberately runs extension lifecycle scripts, so an
 * unbounded buffer would let a chatty or looping script exhaust the heap.
 * The streams are still drained in full; only the tail is retained.
 */
const MAX_CAPTURED_CHARACTERS = 64 * 1024

function appendTail(current: string, chunk: string): string {
    const combined = current + chunk
    return combined.length > MAX_CAPTURED_CHARACTERS
        ? combined.slice(combined.length - MAX_CAPTURED_CHARACTERS)
        : combined
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
        // Decoding per stream rather than per chunk: a multi-byte character
        // split across two reads would otherwise come back as replacement
        // characters, which npm's progress output makes likely.
        child.stdout?.setEncoding('utf8')
        child.stderr?.setEncoding('utf8')
        child.stdout?.on('data', (chunk: string) => {
            stdout = appendTail(stdout, chunk)
        })
        child.stderr?.on('data', (chunk: string) => {
            stderr = appendTail(stderr, chunk)
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

/**
 * Control characters, other than tab and newline: the C0 and C1 ranges and
 * delete.
 *
 * These strings are the output of a program reached over the network — a git
 * remote's error text arrives verbatim — and they are printed to a terminal,
 * which acts on escape sequences rather than showing them. A hostile remote
 * could otherwise move the cursor, recolour the screen, or overwrite the lines
 * around its own message.
 */
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g

/** Make a program's output safe to print. */
export function sanitizeOutput(text: string): string {
    return text.replace(CONTROL_CHARACTERS, '')
}

/** The last few lines of a failed command's output, for use as error hints. */
export function outputHints(result: RunResult, limit = 4): string[] {
    return sanitizeOutput(`${result.stderr}\n${result.stdout}`)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-limit)
}

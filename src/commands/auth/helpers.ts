import { createInterface } from 'node:readline'
import chalk from 'chalk'
import type { TokenStorageResult } from '../../lib/auth.js'

export function promptHiddenInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        })
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        const origWrite = (rl as any)._writeToOutput
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        ;(rl as any)._writeToOutput = (str: string) => {
            if (str.includes(prompt)) {
                origWrite.call(rl, prompt)
            }
        }
        rl.question(prompt, (answer) => {
            rl.close()
            process.stdout.write('\n')
            resolve(answer)
        })
    })
}

/**
 * Surface a `TokenStorageResult` from a save/clear operation: the
 * human-readable confirmation goes to stdout, any keyring-fallback warning
 * goes to stderr. Pass `isMachineOutput: true` when the command is in
 * `--json` / `--ndjson` mode so the stdout confirmation is suppressed and
 * the warning still reaches the operator on stderr.
 */
export function logTokenStorageResult(
    result: TokenStorageResult,
    secureStoreMessage: string,
    isMachineOutput = false,
): void {
    if (!isMachineOutput && result.storage === 'secure-store') {
        console.log(chalk.dim(secureStoreMessage))
    }

    if (result.warning) {
        console.error(chalk.yellow('Warning:'), result.warning)
    }
}

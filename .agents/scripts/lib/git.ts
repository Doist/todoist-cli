import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The checkout this copy of the tooling lives in, whatever the caller's working directory. */
export const CHECKOUT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

// Git exports GIT_DIR, GIT_INDEX_FILE and friends to hooks. A tool that runs git with them in
// place acts on whatever repository they name, not the one it was asked about.
let localVars: string[] | undefined
function localGitVars(): string[] {
    localVars ??= spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
        .stdout.split('\n')
        .filter(Boolean)
    return localVars
}

export function cleanGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const clean = { ...env }
    for (const name of localGitVars()) delete clean[name]
    return clean
}

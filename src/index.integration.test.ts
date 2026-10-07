import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url))

beforeAll(() => {
    execFileSync(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'],
        {
            cwd: repoRoot,
        },
    )
})

function run(...args: string[]) {
    const result = spawnSync(process.execPath, [executable, ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, TODOIST_API_TOKEN: '', TD_USER: '' },
    })
    if (result.error) throw result.error
    return result
}

it('prints complete JSON help for the root and a scoped command', () => {
    const root = run('--help', '--json')
    expect(root.status).toBe(0)
    const rootHelp = JSON.parse(root.stdout)
    expect(rootHelp.name).toBe('td')
    expect(rootHelp.commands.some((command: { name: string }) => command.name === 'task')).toBe(
        true,
    )

    const scoped = run('task', '--quiet', 'complete', '--help', '--json')
    expect(scoped.status).toBe(0)
    const scopedHelp = JSON.parse(scoped.stdout)
    expect(scopedHelp.name).toBe('complete')
    expect(scopedHelp.options.map((option: { flags: string }) => option.flags)).toContain('--json')
})

it('prints JSON errors for unknown options and missing mutation arguments', () => {
    const unknown = run('task', 'complete', 'id:example', '--json', '--not-a-real-option')
    expect(unknown.status).toBe(1)
    expect(JSON.parse(unknown.stderr).error.code).toBe('INVALID_OPTIONS')

    const missing = run('task', 'complete', '--json')
    expect(missing.status).toBe(1)
    expect(JSON.parse(missing.stderr).error.code).toBe('MISSING_ARGUMENT')
})

it('does not report an unconfirmed deletion as a successful write', () => {
    const result = run('task', 'delete', 'id:example', '--json')
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr).error.code).toBe('CONFIRMATION_REQUIRED')
    expect(result.stdout).toBe('')
})

it('leaves extension exec flags with the extension', () => {
    const result = run('extension', 'exec', 'codex-review-nonexistent-585', '--help', '--json')
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr).error.code).toBe('EXTENSION_NOT_FOUND')
    expect(result.stdout).toBe('')
})

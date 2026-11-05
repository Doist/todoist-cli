import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeJson } from './state.ts'
import { CI_EQUIVALENTS, preflight, VERIFY_STEPS } from './steps.ts'
import { REPO_ROOT } from './test-repo.ts'
import { CHECKED_WORKFLOWS } from './tree.ts'

const WORKFLOWS_DIR = join(REPO_ROOT, '.github/workflows')
const readWorkflow = (name: string) => readFileSync(join(WORKFLOWS_DIR, name), 'utf8')

// A line in a `run: |` script that runs a tool. The lines around them are shell guards (if, echo,
// exit, fi).
const TOOL_LINE = /^(npm|npx|node|gh|tsc|vitest|oxlint|oxfmt)\s/

/**
 * The commands a workflow runs: each one-line `run:`, and every tool line of a `run: |` script, so a
 * check added to a script cannot hide behind the command that was already there.
 */
function workflowCommands(text: string): string[] {
    const commands: string[] = []
    const lines = text.split('\n')
    lines.forEach((line, index) => {
        const match = line.match(/^(\s+)(?:- )?run: (.+)$/)
        if (!match) return
        const [, indent = '', value = ''] = match
        if (!value.startsWith('|')) {
            commands.push(value.trim())
            return
        }
        for (const next of lines.slice(index + 1)) {
            if (next.trim() && next.search(/\S/) <= indent.length) break
            if (TOOL_LINE.test(next.trim())) commands.push(next.trim())
        }
    })
    return commands
}

/** The `on:` trigger, inline (`on: [push, pull_request]`) or as an indented block. */
function triggers(text: string): string {
    const match = text.match(/^["']?on["']?:(.*)\n((?:(?:[ \t].*)?\n)*)/m)
    return match ? `${match[1]}\n${match[2]}` : ''
}

const runsOnPullRequests = (text: string) => /\bpull_request(_target)?\b/.test(triggers(text))

describe('reading workflows', () => {
    it.each([
        ['on:\n    pull_request:\n', true],
        ['on:\n    pull_request_target:\n        types: [opened]\n', true],
        ['on: [push, pull_request]\n', true],
        ['on: { pull_request: {} }\n', true],
        ['"on": pull_request\n', true],
        ['on:\n    issues:\n        types: [opened]\n', false],
        ["on:\n    push:\njobs:\n    a:\n        if: github.event_name == 'pull_request'\n", false],
    ])('%j runs on pull requests: %s', (text, expected) => {
        expect(runsOnPullRequests(text)).toBe(expected)
    })

    it('takes every tool line of a script, not only its last one', () => {
        const text = [
            'steps:',
            '    - run: |',
            '          if ! gh skill --help >/dev/null 2>&1; then',
            '              echo "skipping"',
            '              exit 0',
            '          fi',
            '          npm run new-check',
            '          gh skill publish --dry-run',
            '    - run: npm test',
            '',
        ].join('\n')
        expect(workflowCommands(text)).toEqual([
            'npm run new-check',
            'gh skill publish --dry-run',
            'npm test',
        ])
    })
})

describe('verify covers CI', () => {
    it('reads every pull-request workflow that runs a command', () => {
        const running = readdirSync(WORKFLOWS_DIR)
            .filter((name) => /\.ya?ml$/.test(name))
            .filter((name) => {
                const text = readWorkflow(name)
                return runsOnPullRequests(text) && workflowCommands(text).length > 0
            })
            .map((name) => `.github/workflows/${name}`)
        expect(running.toSorted()).toEqual(CHECKED_WORKFLOWS.toSorted())
    })

    it('has an equivalent for every command in those workflows, and only those', () => {
        const commands = new Set(
            CHECKED_WORKFLOWS.flatMap((path) => workflowCommands(readWorkflow(basename(path)))),
        )
        expect(commands.size).toBeGreaterThan(4)
        expect([...commands].toSorted()).toEqual(
            CI_EQUIVALENTS.map((entry) => entry.run).toSorted(),
        )
    })

    it('says why a command has no verify step', () => {
        for (const entry of CI_EQUIVALENTS) {
            if (entry.steps.length === 0) expect(entry.why, entry.run).toBeTruthy()
        }
    })

    it('runs the same commands as the package.json scripts CI calls', () => {
        const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>
        }
        const normalize = (command: string) => command.trim().replace(/^npx /, '')
        const stepCommand = (name: string) => {
            const step = VERIFY_STEPS.find((candidate) => candidate.name === name)
            return normalize([basename(step?.command ?? ''), ...(step?.args ?? [])].join(' '))
        }
        const scripted = CI_EQUIVALENTS.filter((entry) => entry.steps.length > 0)
        for (const entry of scripted) {
            const [, run, test] = entry.run.match(/^npm (?:run (\S+)|(test))$/) ?? []
            const script = run ?? test
            expect(script, entry.run).toBeDefined()
            const commands = (pkg.scripts[script ?? ''] ?? '').split('&&').map(normalize)
            expect({ script, commands }).toEqual({ script, commands: entry.steps.map(stepCommand) })
        }
    })

    it('names only steps that exist', () => {
        const names = VERIFY_STEPS.map((step) => step.name)
        for (const entry of CI_EQUIVALENTS) {
            for (const step of entry.steps) expect(names).toContain(step)
        }
        for (const step of VERIFY_STEPS) {
            if (step.after) expect(names).toContain(step.after)
            for (const other of step.waitFor ?? []) expect(names).toContain(other)
        }
    })

    it('never runs the tests alongside a step that reads or writes dist/', () => {
        const step = (name: string) => VERIFY_STEPS.find((candidate) => candidate.name === name)
        expect(step('tests')?.waitFor).toContain('build')
        expect(step('skill-sync')?.waitFor).toContain('tests')
    })
})

describe('preflight', () => {
    let root: string

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'agent-preflight-'))
        writeJson(join(root, 'package.json'), {
            engines: { node: '>=24' },
            dependencies: { zod: '1.0.0' },
            devDependencies: { vitest: '2.0.0' },
        })
        writeJson(join(root, 'package-lock.json'), {
            packages: {
                '': { dependencies: { zod: '1.0.0' }, devDependencies: { vitest: '2.0.0' } },
                'node_modules/zod': { version: '1.0.0' },
                'node_modules/vitest': { version: '2.0.0' },
            },
        })
        writeInstalled({
            'node_modules/zod': { version: '1.0.0' },
            'node_modules/vitest': { version: '2.0.0' },
        })
    })

    // What npm records about the tree it installed.
    const writeInstalled = (packages: Record<string, { version: string }>) =>
        writeJson(join(root, 'node_modules/.package-lock.json'), { packages })

    afterEach(() => rmSync(root, { recursive: true, force: true }))

    it('passes a current install on a supported Node', () => {
        expect(preflight(root, '24.0.0')).toEqual([])
    })

    it('rejects a Node older than package.json engines', () => {
        const [problem] = preflight(root, '22.22.2')
        expect(problem).toContain('Node 22.22.2 is older than the >=24')
    })

    it('names a dependency whose installed version differs from the lockfile', () => {
        writeInstalled({
            'node_modules/zod': { version: '0.9.0' },
            'node_modules/vitest': { version: '2.0.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: zod 0.9.0 (lockfile: 1.0.0). Run `npm ci`.',
        ])
    })

    it('names a dependency that is not installed', () => {
        writeInstalled({ 'node_modules/zod': { version: '1.0.0' } })
        expect(preflight(root, '24.0.0')[0]).toContain('vitest missing (lockfile: 2.0.0)')
    })

    it('names a transitive dependency that changed while every direct one kept its version', () => {
        const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
            packages: Record<string, unknown>
        }
        lock.packages['node_modules/undici'] = { version: '7.1.0' }
        writeJson(join(root, 'package-lock.json'), lock)
        writeInstalled({
            'node_modules/zod': { version: '1.0.0' },
            'node_modules/vitest': { version: '2.0.0' },
            'node_modules/undici': { version: '7.0.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: undici 7.0.0 (lockfile: 7.1.0). Run `npm ci`.',
        ])
    })

    it('accepts optional packages for other platforms that were never installed', () => {
        const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
            packages: Record<string, unknown>
        }
        lock.packages['node_modules/@oxlint/darwin-arm64'] = { version: '1.0.0', optional: true }
        lock.packages['node_modules/@oxfmt/win32-x64'] = { version: '1.0.0', devOptional: true }
        writeJson(join(root, 'package-lock.json'), lock)
        expect(preflight(root, '24.0.0')).toEqual([])
    })

    it('says when node_modules has no record of what npm installed', () => {
        rmSync(join(root, 'node_modules/.package-lock.json'))
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules has no record of what npm installed. Run `npm ci`.',
        ])
    })

    it('names a dependency package.json and the lockfile disagree on', () => {
        writeJson(join(root, 'package.json'), {
            engines: { node: '>=24' },
            dependencies: { zod: '1.1.0', added: '1.0.0' },
            devDependencies: { vitest: '2.0.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'package.json and package-lock.json disagree: zod (package.json: 1.1.0, lockfile: 1.0.0), added (package.json: 1.0.0, lockfile: none). Run `npm install`.',
        ])
    })

    it('says when the lockfile is missing', () => {
        rmSync(join(root, 'package-lock.json'))
        expect(preflight(root, '24.0.0')).toEqual([
            'package-lock.json is missing or unreadable. Run `npm install`.',
        ])
    })

    it('says when node_modules is missing', () => {
        rmSync(join(root, 'node_modules'), { recursive: true })
        expect(preflight(root, '24.0.0')).toEqual(['node_modules is missing. Run `npm ci`.'])
    })
})

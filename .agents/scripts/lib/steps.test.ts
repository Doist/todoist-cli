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

/**
 * The commands a workflow runs. A one-line `run:` is the command; a `run: |` script is named by
 * its last line, the command it exists to run (the lines above guard it).
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
        const body: string[] = []
        for (const next of lines.slice(index + 1)) {
            if (next.trim() && next.search(/\S/) <= indent.length) break
            if (next.trim()) body.push(next.trim())
        }
        commands.push(body.at(-1) ?? '')
    })
    return commands
}

const runsOnPullRequests = (text: string) => /^\s+pull_request:?\s*$/m.test(text)

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
        writeJson(join(root, 'node_modules/zod/package.json'), { version: '1.0.0' })
        writeJson(join(root, 'node_modules/vitest/package.json'), { version: '2.0.0' })
    })

    afterEach(() => rmSync(root, { recursive: true, force: true }))

    it('passes a current install on a supported Node', () => {
        expect(preflight(root, '24.0.0')).toEqual([])
    })

    it('rejects a Node older than package.json engines', () => {
        const [problem] = preflight(root, '22.22.2')
        expect(problem).toContain('Node 22.22.2 is older than the >=24')
    })

    it('names a dependency whose installed version differs from the lockfile', () => {
        writeJson(join(root, 'node_modules/zod/package.json'), { version: '0.9.0' })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: zod 0.9.0 (lockfile: 1.0.0). Run `npm ci`.',
        ])
    })

    it('names a dependency that is not installed', () => {
        rmSync(join(root, 'node_modules/vitest'), { recursive: true })
        expect(preflight(root, '24.0.0')[0]).toContain('vitest missing (lockfile: 2.0.0)')
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

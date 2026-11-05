import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readJson } from './state.ts'
import type { Step } from './verify.ts'

const bin = (tool: string) => `node_modules/.bin/${tool}`

// GitHub Actions sets CI=true for every job. cli-core's `isCI()` reads it, and it makes vitest fail
// on `.only`, so checks run with it to match CI.
const CI_ENV = { CI: 'true' }

/** Every check the pull-request workflows in CHECKED_WORKFLOWS run, with one shared build. */
export const VERIFY_STEPS: Step[] = [
    { name: 'lint', command: bin('oxlint'), args: ['src', '.agents/scripts'] },
    { name: 'format', command: bin('oxfmt'), args: ['--check'] },
    { name: 'types', command: bin('tsc'), args: ['--noEmit'] },
    { name: 'types:tools', command: bin('tsc'), args: ['--noEmit', '-p', '.agents/scripts'] },
    { name: 'build', command: bin('tsc'), args: ['-p', 'tsconfig.build.json'], env: CI_ENV },
    // src/index.integration.test.ts rebuilds dist/ and runs it, so the tests start once the
    // build has finished writing dist/, and skill-sync, which imports from dist/, once they end.
    { name: 'tests', command: bin('vitest'), args: ['run'], env: CI_ENV, waitFor: ['build'] },
    {
        name: 'skill-sync',
        command: 'node',
        args: ['scripts/check-skill-sync.js'],
        after: 'build',
        waitFor: ['tests'],
        env: CI_ENV,
    },
]

/**
 * How each `run:` in the checked workflows maps to verify steps. For an npm script, the steps
 * must run the script's commands, in order; steps.test.ts compares them with package.json and the
 * workflows, so CI and verify cannot drift apart silently. A step list left empty says why.
 */
export const CI_EQUIVALENTS: { run: string; steps: string[]; why?: string }[] = [
    { run: 'npm ci', steps: [], why: 'the preflight checks node_modules matches the lockfile' },
    { run: 'npm run type-check', steps: ['types', 'types:tools'] },
    { run: 'npm run check', steps: ['lint', 'format'] },
    { run: 'npm run build', steps: ['build'] },
    { run: 'npm test', steps: ['tests'] },
    { run: 'npm run check:skill-sync', steps: ['skill-sync'] },
    {
        run: 'gh skill publish --dry-run',
        steps: [],
        why: "it needs gh's preview `skill` command and a GitHub token; CI skips it without them too",
    },
]

/**
 * Variables that change what the CLI does or prints. CI never sets them, so verify removes them,
 * and the checks see what CI sees. A real TODOIST_API_TOKEN never reaches the tests either.
 */
export const LOCAL_ONLY_ENV = [
    'TD_ACCESSIBLE',
    'TD_SPINNER',
    'TD_USER',
    'TD_VERBOSE',
    'TODOIST_API_TOKEN',
    'FORCE_COLOR',
]

type PackageJson = {
    engines?: { node?: string }
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
}
type Lockfile = {
    packages?: Record<
        string,
        {
            version?: string
            dependencies?: Record<string, string>
            devDependencies?: Record<string, string>
        }
    >
}

/** Problems that would make the checks fail for reasons unrelated to the change. */
export function preflight(root: string, nodeVersion = process.versions.node): string[] {
    const problems: string[] = []
    const pkg = readJson<PackageJson>(join(root, 'package.json'))
    const minimum = pkg?.engines?.node?.match(/^>=\s*(\d+)/)?.[1]
    const major = Number(nodeVersion.split('.')[0])
    if (minimum && major < Number(minimum)) {
        problems.push(
            `Node ${nodeVersion} is older than the ${pkg?.engines?.node} this repository needs. ` +
                'Switch versions (see .nvmrc) and run again.',
        )
    }

    if (!existsSync(join(root, 'node_modules'))) {
        problems.push('node_modules is missing. Run `npm ci`.')
        return problems
    }
    const lock = readJson<Lockfile>(join(root, 'package-lock.json'))
    if (!lock?.packages) {
        problems.push('package-lock.json is missing or unreadable. Run `npm install`.')
        return problems
    }
    // npm ci refuses to install when package.json and the lockfile disagree, so CI would fail
    // before any check runs.
    const manifest = lock.packages[''] ?? {}
    const disagree: string[] = []
    for (const field of ['dependencies', 'devDependencies'] as const) {
        const wanted = pkg?.[field] ?? {}
        const locked = manifest[field] ?? {}
        for (const name of new Set([...Object.keys(wanted), ...Object.keys(locked)])) {
            if (wanted[name] !== locked[name]) {
                disagree.push(
                    `${name} (package.json: ${wanted[name] ?? 'none'}, lockfile: ${locked[name] ?? 'none'})`,
                )
            }
        }
    }
    if (disagree.length > 0) {
        problems.push(
            `package.json and package-lock.json disagree: ${disagree.join(', ')}. Run \`npm install\`.`,
        )
        return problems
    }

    const stale: string[] = []
    for (const name of Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies })) {
        const locked = lock.packages[`node_modules/${name}`]?.version
        if (!locked) {
            stale.push(`${name} is not in the lockfile`)
            continue
        }
        const installed = readJson<{ version?: string }>(
            join(root, 'node_modules', name, 'package.json'),
        )?.version
        if (installed !== locked) {
            stale.push(`${name} ${installed ?? 'missing'} (lockfile: ${locked})`)
        }
    }
    if (stale.length > 0) {
        problems.push(
            `node_modules does not match package-lock.json: ${stale.join(', ')}. Run \`npm ci\`.`,
        )
    }
    return problems
}

/** What verification cannot see, printed after every pass. */
export const BLIND_SPOTS = [
    'calls against the real Todoist API (run `node dist/index.js <command>` on a test account)',
    'output in a real terminal: colours, spinners, `--accessible` (run the command in a TTY)',
    'the other Node version CI tests on (24 and 26); verify uses only yours',
    'the `gh skill publish --dry-run` spec check of skills/todoist-cli/SKILL.md (CI only)',
]

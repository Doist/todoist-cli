import { existsSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

const DB_PATH = process.env.TD_BENCH_DB_PATH ?? '/tmp/todoist-cli-read-bench-present.db'
const runsEnv = Number.parseInt(process.env.TD_BENCH_RUNS ?? '5', 10)
const RUNS = Number.isFinite(runsEnv) && runsEnv > 0 ? runsEnv : 5

const OFF_ENV = {
    TD_SYNC_DISABLE: '1',
}

const ON_ENV = {
    TD_SYNC_DISABLE: '0',
    TD_SYNC_DB_PATH: DB_PATH,
    TD_SYNC_TTL_SECONDS: process.env.TD_SYNC_TTL_SECONDS ?? '3600',
}

function runTd(args, envOverrides) {
    const start = process.hrtime.bigint()
    const result = spawnSync('node', ['dist/index.js', ...args], {
        cwd: repoRoot,
        env: { ...process.env, ...envOverrides },
        encoding: 'utf8',
    })
    const end = process.hrtime.bigint()
    const elapsedMs = Number((end - start) / 1000000n)

    if (result.status !== 0) {
        throw new Error(
            [
                `td ${args.join(' ')} failed (status=${result.status})`,
                `stdout:\n${(result.stdout || '').trim()}`,
                `stderr:\n${(result.stderr || '').trim()}`,
            ].join('\n'),
        )
    }

    return { ms: elapsedMs, stdout: result.stdout }
}

function stats(values) {
    const sorted = [...values].sort((a, b) => a - b)
    const sum = values.reduce((acc, value) => acc + value, 0)
    const avg = sum / values.length
    const median =
        sorted.length % 2 === 1
            ? sorted[Math.floor(sorted.length / 2)]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    return {
        avg,
        median,
        min: sorted[0],
        max: sorted[sorted.length - 1],
    }
}

function fmtStats(label, values) {
    const s = stats(values)
    return `${label} avg=${s.avg.toFixed(1)} ms median=${s.median.toFixed(1)} ms min=${s.min} ms max=${s.max} ms`
}

function outputSignature(output) {
    try {
        const parsed = JSON.parse(output)
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.results)) {
            const ids = parsed.results
                .map((item) => (item && typeof item === 'object' ? item.id : undefined))
                .filter((id) => typeof id === 'string')
            const sample = ids.slice(0, 10).join(',')
            const nextCursor = parsed.nextCursor === null ? 'null' : String(parsed.nextCursor)
            return `json results=${parsed.results.length} next=${nextCursor} ids10=${sample}${ids.length > 10 ? ',...' : ''}`
        }

        if (Array.isArray(parsed)) {
            const ids = parsed
                .map((item) => (item && typeof item === 'object' ? item.id : undefined))
                .filter((id) => typeof id === 'string')
            const sample = ids.slice(0, 10).join(',')
            return `json-array count=${parsed.length} ids10=${sample}${ids.length > 10 ? ',...' : ''}`
        }

        if (parsed && typeof parsed === 'object') {
            return `json-object keys=${Object.keys(parsed).sort().join(',')}`
        }

        return `json-scalar type=${typeof parsed}`
    } catch {
        const hash = createHash('sha256').update(output).digest('hex').slice(0, 16)
        return `text bytes=${Buffer.byteLength(output, 'utf8')} sha256=${hash}`
    }
}

function parseJsonOutput(output, commandLabel) {
    try {
        return JSON.parse(output)
    } catch {
        throw new Error(`Expected JSON output from ${commandLabel}`)
    }
}

function firstIdFromResults(parsed, commandLabel) {
    const results = parsed?.results
    if (!Array.isArray(results) || results.length === 0) return null
    const first = results[0]
    if (!first || typeof first !== 'object' || typeof first.id !== 'string') {
        throw new Error(`Unexpected JSON shape for ${commandLabel}`)
    }
    return first.id
}

function prewarmDbAndLoadRefs() {
    console.log(`Using persistent warm DB: ${DB_PATH}`)

    // Ensure current user id is cached for local today/upcoming assignee filtering.
    runTd(['activity', '--by', 'me', '--json', '--limit', '1'], ON_ENV)

    const taskListWarm = runTd(['task', 'list', '--json', '--limit', '50'], ON_ENV)
    const workspaceListWarm = runTd(['workspace', 'list', '--json'], ON_ENV)
    const projectListWarm = runTd(['project', 'list', '--json', '--limit', '50'], ON_ENV)

    const taskId = firstIdFromResults(parseJsonOutput(taskListWarm.stdout, 'task list'), 'task list')
    const projectId = firstIdFromResults(
        parseJsonOutput(projectListWarm.stdout, 'project list'),
        'project list',
    )

    const workspaceParsed = workspaceListWarm.stdout.trim()
        ? parseJsonOutput(workspaceListWarm.stdout, 'workspace list')
        : { results: [] }
    const workspaceId = firstIdFromResults(workspaceParsed, 'workspace list')

    return {
        taskId,
        projectId,
        workspaceId,
        dbExists: existsSync(DB_PATH),
    }
}

function benchmarkCase({ title, args }) {
    const beforeTimes = []
    const afterTimes = []

    let beforeOutput = ''
    let afterOutput = ''

    for (let i = 0; i < RUNS; i += 1) {
        const run = runTd(args, OFF_ENV)
        beforeTimes.push(run.ms)
        if (i === 0) beforeOutput = run.stdout
    }

    for (let i = 0; i < RUNS; i += 1) {
        const run = runTd(args, ON_ENV)
        afterTimes.push(run.ms)
        if (i === 0) afterOutput = run.stdout
    }

    const beforeAvg = stats(beforeTimes).avg
    const afterAvg = stats(afterTimes).avg
    const fasterByMs = beforeAvg - afterAvg
    const speedupPct = beforeAvg === 0 ? 0 : (fasterByMs / beforeAvg) * 100

    const beforeSig = outputSignature(beforeOutput)
    const afterSig = outputSignature(afterOutput)

    return {
        title,
        args,
        beforeTimes,
        afterTimes,
        fasterByMs,
        speedupPct,
        beforeSig,
        afterSig,
        signatureMatch: beforeSig === afterSig,
    }
}

function main() {
    const refs = prewarmDbAndLoadRefs()

    const cases = [
        { title: 'today --json', args: ['today', '--json'] },
        { title: 'upcoming --json', args: ['upcoming', '--json'] },
        { title: 'inbox --json --limit 50', args: ['inbox', '--json', '--limit', '50'] },
        { title: 'task list --json --limit 50', args: ['task', 'list', '--json', '--limit', '50'] },
        { title: 'task view id:<task> --json', args: ['task', 'view', `id:${refs.taskId}`, '--json'] },
        {
            title: 'task list --project id:<project> --json --limit 50',
            args: ['task', 'list', '--project', `id:${refs.projectId}`, '--json', '--limit', '50'],
        },
        {
            title: 'project view id:<project> --json',
            args: ['project', 'view', `id:${refs.projectId}`, '--json'],
        },
        { title: 'filter list --json', args: ['filter', 'list', '--json'] },
    ]

    if (refs.workspaceId) {
        cases.push(
            { title: 'workspace list --json', args: ['workspace', 'list', '--json'] },
            {
                title: 'workspace view id:<workspace>',
                args: ['workspace', 'view', `id:${refs.workspaceId}`],
            },
            {
                title: 'task list --workspace id:<workspace> --json --limit 50',
                args: [
                    'task',
                    'list',
                    '--workspace',
                    `id:${refs.workspaceId}`,
                    '--json',
                    '--limit',
                    '50',
                ],
            },
        )
    }

    const results = []
    for (const benchCase of cases) {
        const result = benchmarkCase(benchCase)
        results.push(result)

        console.log(`\n=== ${result.title} ===`)
        console.log(fmtStats('sync_off', result.beforeTimes))
        console.log(fmtStats('sync_on_warm', result.afterTimes))
        console.log(
            `speedup=${result.speedupPct.toFixed(1)}% (${result.fasterByMs.toFixed(1)} ms faster)`,
        )
        console.log(`signature off: ${result.beforeSig}`)
        console.log(`signature on:  ${result.afterSig}`)
        console.log(`signature_match=${result.signatureMatch}`)
    }

    const summary = {
        generatedAt: new Date().toISOString(),
        dbPath: DB_PATH,
        dbExists: refs.dbExists,
        runsPerCase: RUNS,
        cases: results.map((r) => ({
            title: r.title,
            args: r.args,
            syncOffAvgMs: Number(stats(r.beforeTimes).avg.toFixed(1)),
            syncOnWarmAvgMs: Number(stats(r.afterTimes).avg.toFixed(1)),
            fasterByMs: Number(r.fasterByMs.toFixed(1)),
            speedupPct: Number(r.speedupPct.toFixed(1)),
            signatureMatch: r.signatureMatch,
        })),
    }

    const summaryPath = '/tmp/todoist-cache-benchmark-summary.json'
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    console.log(`\nSummary written to ${summaryPath}`)
}

main()

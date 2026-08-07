import chalk from 'chalk'
import { getApi, type Project, type Task } from '../../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { resolveProjectId } from '../../lib/refs.js'

interface CompletedListOptions extends PaginatedViewOptions {
    since?: string
    until?: string
    project?: string
    search?: string
}

const MAX_COMPLETION_DATE_RANGE_DAYS = 93
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_IN_MS = 24 * 60 * 60 * 1000

function getLocalDate(daysOffset = 0): string {
    const date = new Date()
    date.setDate(date.getDate() + daysOffset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDateOption(value: string, option: '--since' | '--until'): number {
    const match = DATE_PATTERN.exec(value)
    if (!match) {
        throw new CliError('INVALID_DATE', `Invalid ${option} date: "${value}"`, [
            `Use YYYY-MM-DD format, for example: ${option} 2026-08-07`,
        ])
    }

    const [, yearString, monthString, dayString] = match
    const year = Number(yearString)
    const month = Number(monthString)
    const day = Number(dayString)
    const timestamp = Date.UTC(year, month - 1, day)
    const parsed = new Date(timestamp)

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        throw new CliError('INVALID_DATE', `Invalid ${option} date: "${value}"`, [
            `Use a valid calendar date in YYYY-MM-DD format`,
        ])
    }

    return timestamp
}

function validateCompletionDateRange(since: string, until: string): void {
    const sinceTimestamp = parseDateOption(since, '--since')
    const untilTimestamp = parseDateOption(until, '--until')
    const rangeDays = (untilTimestamp - sinceTimestamp) / DAY_IN_MS

    if (rangeDays <= 0) {
        throw new CliError('INVALID_DATE_RANGE', '--until must be later than --since', [
            `Received --since ${since} --until ${until}`,
        ])
    }

    if (rangeDays > MAX_COMPLETION_DATE_RANGE_DAYS) {
        const suggestedSince = new Date(untilTimestamp - MAX_COMPLETION_DATE_RANGE_DAYS * DAY_IN_MS)
            .toISOString()
            .slice(0, 10)
        throw new CliError(
            'INVALID_DATE_RANGE',
            'Completed-task date ranges cannot exceed 3 months',
            [
                `Retry the same command with --since ${suggestedSince} --until ${until} for the most recent ${MAX_COMPLETION_DATE_RANGE_DAYS}-day segment.`,
            ],
        )
    }
}

export async function listCompleted(options: CompletedListOptions): Promise<void> {
    const isSearch = options.search !== undefined

    if (isSearch && !options.search) {
        throw new CliError('INVALID_SEARCH', 'Search query cannot be empty')
    }

    if (isSearch && (options.since || options.until || options.project)) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot use --since, --until, or --project with --search',
        )
    }

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const since = isSearch ? undefined : (options.since ?? getLocalDate(0))
    const until = isSearch ? undefined : (options.until ?? getLocalDate(1))

    if (!isSearch) {
        validateCompletionDateRange(since!, until!)
    }

    const api = await getApi()

    let projectId: string | undefined
    if (!isSearch && options.project) {
        projectId = await resolveProjectId(api, options.project)
    }

    const { results: tasks, nextCursor } = await paginate(
        async (cursor, limit) => {
            if (isSearch) {
                const resp = await api.searchCompletedTasks({
                    query: options.search!,
                    cursor: cursor ?? undefined,
                    limit,
                })
                return { results: resp.items, nextCursor: resp.nextCursor }
            }
            const resp = await api.getCompletedTasksByCompletionDate({
                since: since!,
                until: until!,
                projectId,
                cursor: cursor ?? undefined,
                limit,
            })
            return { results: resp.items, nextCursor: resp.nextCursor }
        },
        { limit: targetLimit, startCursor: options.cursor },
    )

    if (tasks.length === 0) {
        if (options.json) {
            console.log(
                formatPaginatedJson(
                    { results: [], nextCursor },
                    'task',
                    options.full,
                    options.showUrls,
                ),
            )
        } else if (options.ndjson) {
            console.log(
                formatPaginatedNdjson(
                    { results: [], nextCursor },
                    'task',
                    options.full,
                    options.showUrls,
                ),
            )
        } else {
            console.log(
                isSearch ? 'No matching completed tasks.' : 'No completed tasks in this period.',
            )
            console.log(formatNextCursorFooter(nextCursor))
        }
        return
    }

    const { results: allProjects } = await api.getProjects()
    const projects = new Map<string, Project>(allProjects.map((p) => [p.id, p]))

    const collaboratorCache = new CollaboratorCache()
    await collaboratorCache.preload(api, tasks, projects)

    const getAssigneeName = (task: Task): string | null => {
        return formatAssignee({
            userId: task.responsibleUid,
            projectId: task.projectId,
            projects,
            cache: collaboratorCache,
        })
    }

    if (options.json) {
        const tasksWithAssignee = tasks.map((task) => ({
            ...task,
            responsibleName: getAssigneeName(task),
        }))
        console.log(
            formatPaginatedJson(
                { results: tasksWithAssignee, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        const tasksWithAssignee = tasks.map((task) => ({
            ...task,
            responsibleName: getAssigneeName(task),
        }))
        console.log(
            formatPaginatedNdjson(
                { results: tasksWithAssignee, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    const header = isSearch
        ? chalk.bold(`Completed (${tasks.length}) - search: "${options.search}"`)
        : chalk.bold(
              `Completed (${tasks.length}) - ${since === until ? since : `${since} to ${until}`}`,
          )
    console.log(header)
    console.log('')

    for (const task of tasks) {
        const projectName = projects.get(task.projectId)?.name
        console.log(
            await formatTaskRow({
                task,
                projectName,
                assignee: getAssigneeName(task) ?? undefined,
                showUrl: options.showUrls,
            }),
        )
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))
}

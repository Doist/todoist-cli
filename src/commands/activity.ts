import type {
    ActivityEvent,
    ActivityEventType,
    ActivityObjectType,
} from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { Command, Option } from 'commander'
import { getApi, getCurrentUserId, isWorkspaceProject, type Project } from '../lib/api/core.js'
import { formatUserShortName } from '../lib/collaborators.js'
import { withCaseInsensitiveChoices } from '../lib/completion.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../lib/output.js'
import { paginate } from '../lib/pagination.js'
import { extractId, isIdRef, resolveProjectId } from '../lib/refs.js'

interface ActivityOptions {
    since?: string
    until?: string
    type?: string
    event?: string
    project?: string
    by?: string
    limit?: string
    cursor?: string
    all?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

const ACTIVITY_LIMIT = 100

const EVENT_COLORS: Record<string, (s: string) => string> = {
    added: chalk.green,
    completed: chalk.green,
    updated: chalk.yellow,
    deleted: chalk.red,
    uncompleted: chalk.yellow,
    archived: chalk.gray,
    unarchived: chalk.cyan,
    shared: chalk.magenta,
    left: chalk.gray,
    reordered: chalk.cyan,
    moved: chalk.cyan,
}

const OBJECT_TYPE_LABELS: Record<string, string> = {
    task: 'task',
    item: 'task',
    comment: 'comment',
    note: 'comment',
    project: 'project',
}

const EVENT_CHOICES = Object.keys(EVENT_COLORS)
const OBJECT_TYPE_CHOICES = [...new Set(Object.values(OBJECT_TYPE_LABELS))]

function formatEventType(eventType: string): string {
    const colorFn = EVENT_COLORS[eventType] || chalk.white
    return colorFn(eventType.padEnd(11))
}

function formatObjectType(objectType: string): string {
    const label = OBJECT_TYPE_LABELS[objectType] || objectType
    return chalk.dim(label.padEnd(8))
}

function formatEventDate(eventDate: string): string {
    const date = new Date(eventDate)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return chalk.dim(`${month}-${day} ${hours}:${minutes}`)
}

function getEventContent(event: ActivityEvent): string {
    const extra = event.extraData as Record<string, unknown> | null

    if (extra?.content) {
        return String(extra.content)
    }
    if (extra?.name) {
        return String(extra.name)
    }
    if (extra?.last_content) {
        return String(extra.last_content)
    }
    if (extra?.last_name) {
        return String(extra.last_name)
    }

    return `id:${event.objectId}`
}

function truncateContent(content: string, maxLength = 100): string {
    const firstLine = content.split('\n')[0]
    if (firstLine.length <= maxLength) {
        return firstLine
    }
    return `${firstLine.slice(0, maxLength - 3)}...`
}

function formatActivityRow(
    event: ActivityEvent,
    projectName?: string,
    initiatorName?: string | null,
    showInitiator = false,
): string {
    const date = formatEventDate(event.eventDate)
    const eventType = formatEventType(event.eventType)
    const objectType = formatObjectType(event.objectType)
    const content = getEventContent(event)

    const metaParts = [date, eventType, objectType]
    if (projectName) {
        metaParts.push(chalk.cyan(projectName))
    }
    if (showInitiator && initiatorName) {
        metaParts.push(chalk.magenta(`by ${initiatorName}`))
    }

    const line1 = `  ${metaParts.join('  ')}`
    const line2 = `    ${truncateContent(content)}`

    return `${line1}\n${line2}`
}

export function registerActivityCommand(program: Command): void {
    program
        .command('activity')
        .description('View activity logs')
        .option('--since <date>', 'Start date (YYYY-MM-DD)')
        .option('--until <date>', 'End date (YYYY-MM-DD)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--type <type>', 'Filter by object type (task, comment, project)'),
                OBJECT_TYPE_CHOICES,
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--event <type>', 'Filter by event type'),
                EVENT_CHOICES,
            ),
        )
        .option('--project <name>', 'Filter by project')
        .option('--by <user>', 'Filter by initiator (use "me" for yourself)')
        .option('--limit <n>', `Limit results (default: ${ACTIVITY_LIMIT})`)
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(async (options: ActivityOptions) => {
            const api = await getApi()

            let projectId: string | undefined
            if (options.project) {
                projectId = await resolveProjectId(api, options.project)
            }

            let initiatorId: string | undefined
            if (options.by) {
                if (options.by.toLowerCase() === 'me') {
                    initiatorId = await getCurrentUserId()
                } else if (isIdRef(options.by)) {
                    initiatorId = extractId(options.by)
                } else {
                    initiatorId = options.by
                }
            }

            const targetLimit = options.all
                ? Number.MAX_SAFE_INTEGER
                : options.limit
                  ? parseInt(options.limit, 10)
                  : ACTIVITY_LIMIT

            const { results: events, nextCursor } = await paginate(
                async (cursor, limit) => {
                    const resp = await api.getActivityLogs({
                        since: options.since ? new Date(options.since) : undefined,
                        until: options.until ? new Date(options.until) : undefined,
                        objectType: options.type as ActivityObjectType | undefined,
                        eventType: options.event as ActivityEventType | undefined,
                        parentProjectId: projectId,
                        initiatorId,
                        cursor: cursor ?? undefined,
                        limit,
                    })
                    return { results: resp.results, nextCursor: resp.nextCursor }
                },
                { limit: targetLimit, startCursor: options.cursor },
            )

            if (options.json) {
                console.log(
                    formatPaginatedJson({ results: events, nextCursor }, undefined, options.full),
                )
                return
            }

            if (options.ndjson) {
                console.log(
                    formatPaginatedNdjson({ results: events, nextCursor }, undefined, options.full),
                )
                return
            }

            if (events.length === 0) {
                console.log('No activity found.')
                console.log(formatNextCursorFooter(nextCursor))
                return
            }

            const { results: allProjects } = await api.getProjects()
            const projects = new Map<string, Project>(allProjects.map((p) => [p.id, p]))

            const workspaceIds = new Set<string>()
            for (const event of events) {
                if (!event.parentProjectId) continue
                const proj = projects.get(event.parentProjectId)
                if (proj && isWorkspaceProject(proj)) {
                    workspaceIds.add(proj.workspaceId)
                }
            }

            const userNames = new Map<string, string>()
            for (const wsId of workspaceIds) {
                let cursor: string | undefined
                while (true) {
                    const response = await api.getWorkspaceUsers({
                        workspaceId: parseInt(wsId, 10),
                        cursor,
                        limit: 200,
                    })
                    for (const user of response.workspaceUsers) {
                        userNames.set(user.userId, user.fullName)
                    }
                    if (!response.hasMore || !response.nextCursor) break
                    cursor = response.nextCursor
                }
            }

            console.log(chalk.bold(`Activity (${events.length})`))
            console.log('')

            for (const event of events) {
                const projectName = event.parentProjectId
                    ? projects.get(event.parentProjectId)?.name
                    : undefined

                let initiatorName: string | null = null
                if (event.initiatorId && userNames.size > 0) {
                    const fullName = userNames.get(event.initiatorId)
                    if (fullName) {
                        initiatorName = formatUserShortName(fullName)
                    }
                }

                console.log(
                    formatActivityRow(event, projectName, initiatorName, userNames.size > 0),
                )
                console.log('')
            }

            console.log(formatNextCursorFooter(nextCursor))
        })
}

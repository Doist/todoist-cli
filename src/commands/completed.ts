import { Command } from 'commander'
import { getApi, type Project } from '../lib/api.js'
import {
  formatTaskRow,
  formatPaginatedJson,
  formatPaginatedNdjson,
  formatNextCursorFooter,
} from '../lib/output.js'
import { paginate, LIMITS } from '../lib/pagination.js'
import { resolveProjectId } from '../lib/refs.js'
import chalk from 'chalk'

interface CompletedOptions {
  since?: string
  until?: string
  project?: string
  limit?: string
  cursor?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

function getLocalDate(daysOffset = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + daysOffset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function registerCompletedCommand(program: Command): void {
  program
    .command('completed')
    .description('Show completed tasks')
    .option('--since <date>', 'Start date (YYYY-MM-DD), default: today')
    .option('--until <date>', 'End date (YYYY-MM-DD), default: tomorrow')
    .option('--project <name>', 'Filter by project')
    .option('--limit <n>', 'Limit number of results (default: 300)')
    .option('--cursor <cursor>', 'Continue from cursor')
    .option('--all', 'Fetch all results (no limit)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(async (options: CompletedOptions) => {
      const api = await getApi()

      const since = options.since ?? getLocalDate(0)
      const until = options.until ?? getLocalDate(1)

      let projectId: string | undefined
      if (options.project) {
        projectId = await resolveProjectId(api, options.project)
      }

      const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

      const { results: tasks, nextCursor } = await paginate(
        async (cursor, limit) => {
          const resp = await api.getCompletedTasksByCompletionDate({
            since,
            until,
            projectId,
            cursor: cursor ?? undefined,
            limit,
          })
          return { results: resp.items, nextCursor: resp.nextCursor }
        },
        { limit: targetLimit, startCursor: options.cursor }
      )

      if (options.json) {
        console.log(
          formatPaginatedJson(
            { results: tasks, nextCursor },
            'task',
            options.full
          )
        )
        return
      }

      if (options.ndjson) {
        console.log(
          formatPaginatedNdjson(
            { results: tasks, nextCursor },
            'task',
            options.full
          )
        )
        return
      }

      if (tasks.length === 0) {
        console.log('No completed tasks in this period.')
        console.log(formatNextCursorFooter(nextCursor))
        return
      }

      const { results: allProjects } = await api.getProjects()
      const projects = new Map<string, Project>(
        allProjects.map((p) => [p.id, p])
      )

      const dateRange = since === until ? since : `${since} to ${until}`
      console.log(chalk.bold(`Completed (${tasks.length}) - ${dateRange}`))
      console.log('')

      for (const task of tasks) {
        const projectName = projects.get(task.projectId)?.name
        console.log(formatTaskRow({ task, projectName }))
        console.log('')
      }
      console.log(formatNextCursorFooter(nextCursor))
    })
}

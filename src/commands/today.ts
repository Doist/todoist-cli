import { Command } from 'commander'
import { getApi, type Project } from '../lib/api.js'
import { formatTaskRow, formatPaginatedJson, formatPaginatedNdjson, formatNextCursorFooter } from '../lib/output.js'
import { paginate, DEFAULT_LIMIT } from '../lib/pagination.js'
import chalk from 'chalk'

interface TodayOptions {
  limit?: string
  cursor?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

export function registerTodayCommand(program: Command): void {
  program
    .command('today')
    .description('Show tasks due today and overdue')
    .option('--limit <n>', 'Limit number of results (default: 300)')
    .option('--cursor <cursor>', 'Continue from cursor')
    .option('--all', 'Fetch all results (no limit)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(async (options: TodayOptions) => {
      const api = await getApi()

      const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : DEFAULT_LIMIT

      const { results: tasks, nextCursor } = await paginate(
        (cursor, limit) => api.getTasks({ cursor: cursor ?? undefined, limit }),
        { limit: targetLimit, startCursor: options.cursor }
      )

      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      const overdue = tasks.filter((t) => t.due && t.due.date < today)
      const dueToday = tasks.filter((t) => t.due?.date === today)
      const allTodayTasks = [...overdue, ...dueToday]

      if (options.json) {
        console.log(formatPaginatedJson({ results: allTodayTasks, nextCursor }, 'task', options.full))
        return
      }

      if (options.ndjson) {
        console.log(formatPaginatedNdjson({ results: allTodayTasks, nextCursor }, 'task', options.full))
        return
      }

      const { results: allProjects } = await api.getProjects()
      const projects = new Map<string, Project>(allProjects.map((p) => [p.id, p]))

      if (overdue.length === 0 && dueToday.length === 0) {
        console.log('No tasks due today.')
        console.log(formatNextCursorFooter(nextCursor))
        return
      }

      if (overdue.length > 0) {
        console.log(chalk.red.bold(`Overdue (${overdue.length})`))
        for (const task of overdue) {
          console.log(formatTaskRow(task, projects.get(task.projectId)?.name))
        }
        console.log('')
      }

      console.log(chalk.bold(`Today (${dueToday.length})`))
      for (const task of dueToday) {
        console.log(formatTaskRow(task, projects.get(task.projectId)?.name))
      }
      console.log(formatNextCursorFooter(nextCursor))
    })
}

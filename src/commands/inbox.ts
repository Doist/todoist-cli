import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import { listTasksForProject, type TaskListOptions } from '../lib/task-list.js'

export function registerInboxCommand(program: Command): void {
  program
    .command('inbox')
    .description('List tasks in Inbox')
    .option('--priority <p1-p4>', 'Filter by priority')
    .option('--due <date>', 'Filter by due date (today, overdue, or YYYY-MM-DD)')
    .option('--limit <n>', 'Limit number of results', '50')
    .option('--json', 'Output as JSON array')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .action(async (options: TaskListOptions) => {
      const api = await getApi()
      const user = await api.getUser()
      await listTasksForProject(user.inboxProjectId, options)
    })
}

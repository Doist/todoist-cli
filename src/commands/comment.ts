import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import { formatPaginatedJson, formatPaginatedNdjson, formatNextCursorFooter, formatError } from '../lib/output.js'
import { paginate, DEFAULT_LIMIT } from '../lib/pagination.js'
import { isIdRef, extractId, requireIdRef } from '../lib/refs.js'
import type { Task } from '@doist/todoist-api-typescript'
import chalk from 'chalk'

async function resolveTaskRef(api: Awaited<ReturnType<typeof getApi>>, ref: string): Promise<Task> {
  if (isIdRef(ref)) {
    return api.getTask(extractId(ref))
  }

  const { results: tasks } = await api.getTasks()
  const lower = ref.toLowerCase()

  const exact = tasks.find((t) => t.content.toLowerCase() === lower)
  if (exact) return exact

  const partial = tasks.filter((t) => t.content.toLowerCase().includes(lower))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    throw new Error(
      formatError(
        'AMBIGUOUS_TASK',
        `Multiple tasks match "${ref}":`,
        partial.slice(0, 5).map((t) => `"${t.content}" (id:${t.id})`)
      )
    )
  }

  throw new Error(formatError('TASK_NOT_FOUND', `Task "${ref}" not found.`))
}

interface ListOptions {
  limit?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

async function listComments(taskRef: string, options: ListOptions): Promise<void> {
  const api = await getApi()
  const task = await resolveTaskRef(api, taskRef)

  const targetLimit = options.all
    ? Number.MAX_SAFE_INTEGER
    : options.limit
      ? parseInt(options.limit, 10)
      : 10

  const { results: comments, nextCursor } = await paginate(
    (cursor, limit) => api.getComments({ taskId: task.id, cursor: cursor ?? undefined, limit }),
    { limit: targetLimit }
  )

  if (options.json) {
    console.log(formatPaginatedJson({ results: comments, nextCursor }, 'comment', options.full))
    return
  }

  if (options.ndjson) {
    console.log(formatPaginatedNdjson({ results: comments, nextCursor }, 'comment', options.full))
    return
  }

  if (comments.length === 0) {
    console.log('No comments.')
    return
  }

  for (const comment of comments) {
    const id = chalk.dim(comment.id)
    const date = chalk.green(comment.postedAt.split('T')[0])
    console.log(`${id}  ${date}`)
    console.log(`  ${comment.content}`)
    console.log('')
  }
  console.log(formatNextCursorFooter(nextCursor))
}

interface AddOptions {
  content: string
}

async function addComment(taskRef: string, options: AddOptions): Promise<void> {
  const api = await getApi()
  const task = await resolveTaskRef(api, taskRef)

  const comment = await api.addComment({
    taskId: task.id,
    content: options.content,
  })

  console.log(`Added comment to "${task.content}"`)
  console.log(chalk.dim(`ID: ${comment.id}`))
}

async function deleteComment(commentId: string, options: { yes?: boolean }): Promise<void> {
  if (!options.yes) {
    throw new Error(formatError('CONFIRMATION_REQUIRED', 'Use --yes to confirm deletion.'))
  }

  const api = await getApi()
  const id = requireIdRef(commentId, 'comment')
  await api.deleteComment(id)
  console.log(`Deleted comment ${id}`)
}

export function registerCommentCommand(program: Command): void {
  const comment = program.command('comment').description('Manage task comments')

  comment
    .command('list <task>')
    .description('List comments on a task')
    .option('--limit <n>', 'Limit number of results (default: 10)')
    .option('--all', 'Fetch all results (no limit)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(listComments)

  comment
    .command('add <task>')
    .description('Add a comment to a task')
    .requiredOption('--content <text>', 'Comment content')
    .action(addComment)

  comment
    .command('delete <id>')
    .description('Delete a comment')
    .option('--yes', 'Confirm deletion')
    .action(deleteComment)
}

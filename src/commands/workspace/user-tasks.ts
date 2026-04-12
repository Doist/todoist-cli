import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { lenientIdRef, resolveWorkspaceRef } from '../../lib/refs.js'
import { resolveWorkspaceUserRef } from './helpers.js'

export interface WorkspaceUserTasksOptions {
    user?: string
    projectIds?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

export async function listWorkspaceUserTasks(
    ref: string,
    options: WorkspaceUserTasksOptions,
): Promise<void> {
    if (!options.user) {
        throw new CliError('MISSING_ID', 'Missing required --user <ref>.', [
            'Pass an email, full name, or id:xxx, e.g. --user alice@example.com',
        ])
    }

    const workspace = await resolveWorkspaceRef(ref)
    const user = await resolveWorkspaceUserRef(workspace.id, options.user)

    const projectIds = options.projectIds
        ? options.projectIds
              .split(',')
              .map((id) => lenientIdRef(id.trim(), 'project'))
              .join(',')
        : undefined

    const api = await getApi()
    const response = await api.getWorkspaceUserTasks({
        workspaceId: workspace.id,
        userId: user.userId,
        projectIds,
    })
    const tasks = response.tasks

    if (options.json) {
        const output = options.full
            ? tasks
            : tasks.map((t) => ({
                  id: t.id,
                  content: t.content,
                  projectId: t.projectId,
                  projectName: t.projectName,
                  priority: t.priority,
                  due: t.due?.date ?? null,
                  isOverdue: t.isOverdue,
              }))
        // `nextCursor: null` mirrors the shape used by other list/report
        // commands so generic JSON consumers can treat all collections
        // uniformly even when the endpoint is unpaginated.
        console.log(JSON.stringify({ results: output, nextCursor: null }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const t of tasks) {
            const output = options.full
                ? t
                : {
                      id: t.id,
                      content: t.content,
                      projectId: t.projectId,
                      projectName: t.projectName,
                      priority: t.priority,
                      due: t.due?.date ?? null,
                      isOverdue: t.isOverdue,
                  }
            console.log(JSON.stringify(output))
        }
        return
    }

    console.log(chalk.bold(`Tasks for ${user.fullName} in ${workspace.name}:`))
    console.log('')

    if (tasks.length === 0) {
        console.log(chalk.dim('(no tasks assigned)'))
        return
    }

    for (const task of tasks) {
        const id = chalk.dim(`id:${task.id}`)
        const content = task.content
        const project = chalk.cyan(`[${task.projectName}]`)
        const due = task.due?.date ? chalk.dim(`(due ${task.due.date})`) : ''
        const overdue = task.isOverdue ? chalk.red(' !overdue') : ''
        console.log(`${id}  ${content} ${project} ${due}${overdue}`)
    }
}

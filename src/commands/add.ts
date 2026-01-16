import chalk from 'chalk'
import { Command } from 'commander'
import { getApi } from '../lib/api/core.js'
import { resolveAssigneeId } from '../lib/collaborators.js'
import { formatDue } from '../lib/output.js'

interface AddOptions {
    assignee?: string
}

export function registerAddCommand(program: Command): void {
    const addCmd = program
        .command('add [text]')
        .description(
            'Quick add task with natural language (e.g., "Buy milk tomorrow p1 #Shopping")',
        )
        .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
        .action(async (text: string | undefined, options: AddOptions) => {
            if (!text) {
                addCmd.help()
                return
            }

            const api = await getApi()
            let task = await api.quickAddTask({ text })

            if (options.assignee) {
                const project = await api.getProject(task.projectId)
                const assigneeId = await resolveAssigneeId(api, options.assignee, project)
                task = await api.updateTask(task.id, { assigneeId })
            }

            console.log(`Created: ${task.content}`)
            if (task.due) console.log(`Due: ${formatDue(task.due)}`)
            console.log(chalk.dim(`ID: ${task.id}`))
        })
}

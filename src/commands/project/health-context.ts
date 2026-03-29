import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function showProjectHealthContext(
    ref: string,
    options: { json?: boolean },
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    const context = await api.getProjectHealthContext(project.id)

    if (options.json) {
        console.log(JSON.stringify(context, null, 2))
        return
    }

    console.log(chalk.bold(context.projectName))
    console.log('')
    console.log('Metrics:')
    const projectMetrics = context.projectMetrics
    console.log(`  Total tasks:          ${projectMetrics.totalTasks}`)
    console.log(`  Completed:            ${projectMetrics.completedTasks}`)
    console.log(`  Overdue:              ${projectMetrics.overdueTasks}`)
    console.log(`  Created this week:    ${projectMetrics.tasksCreatedThisWeek}`)
    console.log(`  Completed this week:  ${projectMetrics.tasksCompletedThisWeek}`)
    if (projectMetrics.averageCompletionTime !== null) {
        console.log(
            `  Avg completion time:  ${projectMetrics.averageCompletionTime.toFixed(1)} days`,
        )
    }

    if (context.tasks.length > 0) {
        console.log('')
        console.log(chalk.dim(`--- Tasks (${context.tasks.length}) ---`))
        for (const task of context.tasks) {
            const parts = [chalk.dim(`id:${task.id}`)]
            parts.push(`p${5 - parseInt(task.priority, 10)}`)
            if (task.due) parts.push(chalk.green(`due:${task.due}`))
            if (task.deadline) parts.push(chalk.red(`deadline:${task.deadline}`))
            if (task.isCompleted) parts.push(chalk.dim('[done]'))
            if (task.labels.length > 0) parts.push(chalk.cyan(task.labels.join(', ')))
            console.log(`  ${task.content}`)
            console.log(`  ${parts.join('  ')}`)
            console.log('')
        }
    }
}

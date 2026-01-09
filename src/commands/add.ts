import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import { formatDue } from '../lib/output.js'
import chalk from 'chalk'

export function registerAddCommand(program: Command): void {
  program
    .command('add <text>')
    .description('Quick add task with natural language (e.g., "Buy milk tomorrow p1 #Shopping")')
    .action(async (text: string) => {
      const api = await getApi()
      const task = await api.quickAddTask({ text })
      console.log(`Created: ${task.content}`)
      if (task.due) console.log(`Due: ${formatDue(task.due)}`)
      console.log(chalk.dim(`ID: ${task.id}`))
    })
}

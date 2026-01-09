#!/usr/bin/env node

import { program } from 'commander'
import { registerTaskCommand } from './commands/task.js'
import { registerProjectCommand } from './commands/project.js'
import { getApi } from './lib/api.js'
import { formatDue } from './lib/output.js'
import chalk from 'chalk'

program
  .name('td')
  .description('Todoist CLI')
  .version('0.1.0')

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

registerTaskCommand(program)
registerProjectCommand(program)

program.parse()

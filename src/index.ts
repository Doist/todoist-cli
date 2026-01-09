#!/usr/bin/env node

import { program } from 'commander'
import { registerTaskCommand } from './commands/task.js'
import { registerProjectCommand } from './commands/project.js'

program
  .name('td')
  .description('Todoist CLI')
  .version('0.1.0')

registerTaskCommand(program)
registerProjectCommand(program)

program.parse()

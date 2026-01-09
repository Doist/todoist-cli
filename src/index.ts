#!/usr/bin/env node

import { program } from 'commander'
import { registerAddCommand } from './commands/add.js'
import { registerTodayCommand } from './commands/today.js'
import { registerInboxCommand } from './commands/inbox.js'
import { registerTaskCommand } from './commands/task.js'
import { registerProjectCommand } from './commands/project.js'
import { registerLabelCommand } from './commands/label.js'
import { registerCommentCommand } from './commands/comment.js'
import { registerSectionCommand } from './commands/section.js'

program
  .name('td')
  .description('Todoist CLI')
  .version('0.1.0')

registerAddCommand(program)
registerTodayCommand(program)
registerInboxCommand(program)
registerTaskCommand(program)
registerProjectCommand(program)
registerLabelCommand(program)
registerCommentCommand(program)
registerSectionCommand(program)

program.parse()

#!/usr/bin/env node

import { program } from 'commander'
import { registerAddCommand } from './commands/add.js'
import { registerTodayCommand } from './commands/today.js'
import { registerUpcomingCommand } from './commands/upcoming.js'
import { registerInboxCommand } from './commands/inbox.js'
import { registerCompletedCommand } from './commands/completed.js'
import { registerTaskCommand } from './commands/task.js'
import { registerProjectCommand } from './commands/project.js'
import { registerLabelCommand } from './commands/label.js'
import { registerCommentCommand } from './commands/comment.js'
import { registerSectionCommand } from './commands/section.js'
import { registerWorkspaceCommand } from './commands/workspace.js'

program
  .name('td')
  .description('Todoist CLI')
  .version('0.1.0')
  .addHelpText('after', `
Note for AI/LLM agents:
  Use --json or --ndjson flags for unambiguous, parseable output.
  Default JSON shows essential fields; use --full for all fields.`)

registerAddCommand(program)
registerTodayCommand(program)
registerUpcomingCommand(program)
registerInboxCommand(program)
registerCompletedCommand(program)
registerTaskCommand(program)
registerProjectCommand(program)
registerLabelCommand(program)
registerCommentCommand(program)
registerSectionCommand(program)
registerWorkspaceCommand(program)

program.parse()

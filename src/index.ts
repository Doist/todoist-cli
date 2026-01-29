#!/usr/bin/env node

import { program } from 'commander'
import packageJson from '../package.json' with { type: 'json' }
import { registerActivityCommand } from './commands/activity.js'
import { registerAddCommand } from './commands/add.js'
import { registerAuthCommand } from './commands/auth.js'
import { registerCommentCommand } from './commands/comment.js'
import { registerCompletedCommand } from './commands/completed.js'
import { registerFilterCommand } from './commands/filter.js'
import { registerInboxCommand } from './commands/inbox.js'
import { registerLabelCommand } from './commands/label.js'
import { registerNotificationCommand } from './commands/notification.js'
import { registerProjectCommand } from './commands/project.js'
import { registerReminderCommand } from './commands/reminder.js'
import { registerSectionCommand } from './commands/section.js'
import { registerSettingsCommand } from './commands/settings.js'
import { registerSkillCommand } from './commands/skill.js'
import { registerStatsCommand } from './commands/stats.js'
import { registerTaskCommand } from './commands/task.js'
import { registerTodayCommand } from './commands/today.js'
import { registerUpcomingCommand } from './commands/upcoming.js'
import { registerWorkspaceCommand } from './commands/workspace.js'

program
    .name('td')
    .description('Todoist CLI')
    .version(packageJson.version)
    .option('--no-spinner', 'Disable loading animations')
    .option('--progress-jsonl [path]', 'Output progress events as JSONL to stderr or file')
    .addHelpText(
        'after',
        `
Note for AI/LLM agents:
  Use --json or --ndjson flags for unambiguous, parseable output.
  Default JSON shows essential fields; use --full for all fields.`,
    )

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
registerActivityCommand(program)
registerReminderCommand(program)
registerSettingsCommand(program)
registerAuthCommand(program)
registerStatsCommand(program)
registerFilterCommand(program)
registerNotificationCommand(program)
registerSkillCommand(program)

program.parseAsync().catch((err: Error) => {
    console.error(err.message)
    process.exit(1)
})

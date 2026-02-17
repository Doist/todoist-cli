#!/usr/bin/env node

import { type Command, program } from 'commander'
import packageJson from '../package.json' with { type: 'json' }
import { initializeLogger } from './lib/logger.js'
import { startEarlySpinner, stopEarlySpinner } from './lib/spinner.js'

program
    .name('td')
    .description('Todoist CLI')
    .version(packageJson.version)
    .option('--no-spinner', 'Disable loading animations')
    .option('--progress-jsonl [path]', 'Output progress events as JSONL to stderr or file')
    .option('-v, --verbose', 'Increase output verbosity (repeat up to 4x: -v, -vv, -vvv, -vvvv)')
    .addHelpText(
        'after',
        `
Note for AI/LLM agents:
  Use "td task add" (not "td add") to create tasks with structured flags.
  Use --json or --ndjson flags for unambiguous, parseable output.
  Default JSON shows essential fields; use --full for all fields.`,
    )

// Lazy command registry: [description, loader]
const commands: Record<string, [string, () => Promise<(p: Command) => void>]> = {
    add: [
        'Quick add task with natural language (e.g., "Buy milk tomorrow p1 #Shopping")',
        async () => (await import('./commands/add.js')).registerAddCommand,
    ],
    today: [
        'Show tasks due today and overdue',
        async () => (await import('./commands/today.js')).registerTodayCommand,
    ],
    upcoming: [
        'Show tasks due in the next N days (default: 7)',
        async () => (await import('./commands/upcoming.js')).registerUpcomingCommand,
    ],
    inbox: [
        'List tasks in Inbox',
        async () => (await import('./commands/inbox.js')).registerInboxCommand,
    ],
    completed: [
        'Show completed tasks',
        async () => (await import('./commands/completed.js')).registerCompletedCommand,
    ],
    view: [
        'Route Todoist web app URLs to matching CLI commands',
        async () => (await import('./commands/view.js')).registerViewCommand,
    ],
    task: ['Manage tasks', async () => (await import('./commands/task.js')).registerTaskCommand],
    project: [
        'Manage projects',
        async () => (await import('./commands/project.js')).registerProjectCommand,
    ],
    label: [
        'Manage labels',
        async () => (await import('./commands/label.js')).registerLabelCommand,
    ],
    comment: [
        'Manage comments',
        async () => (await import('./commands/comment.js')).registerCommentCommand,
    ],
    section: [
        'Manage project sections',
        async () => (await import('./commands/section.js')).registerSectionCommand,
    ],
    workspace: [
        'Manage workspaces',
        async () => (await import('./commands/workspace.js')).registerWorkspaceCommand,
    ],
    activity: [
        'View activity logs',
        async () => (await import('./commands/activity.js')).registerActivityCommand,
    ],
    reminder: [
        'Manage task reminders',
        async () => (await import('./commands/reminder.js')).registerReminderCommand,
    ],
    settings: [
        'Manage user settings',
        async () => (await import('./commands/settings.js')).registerSettingsCommand,
    ],
    auth: [
        'Manage authentication',
        async () => (await import('./commands/auth.js')).registerAuthCommand,
    ],
    stats: [
        'View productivity stats and karma',
        async () => (await import('./commands/stats.js')).registerStatsCommand,
    ],
    filter: [
        'Manage filters',
        async () => (await import('./commands/filter.js')).registerFilterCommand,
    ],
    notification: [
        'Manage notifications',
        async () => (await import('./commands/notification.js')).registerNotificationCommand,
    ],
    skill: [
        'Manage coding agent skills/integrations',
        async () => (await import('./commands/skill.js')).registerSkillCommand,
    ],
    completion: [
        'Manage shell completions',
        async () => (await import('./commands/completion.js')).registerCompletionCommand,
    ],
}

// Register placeholders so --help lists all commands
for (const [name, [description]] of Object.entries(commands)) {
    program.command(name).description(description)
}

// completion-server needs the command tree to walk for completions.
// Only load the completion module + the specific command being completed
// (extracted from COMP_LINE) to keep startup fast.
if (process.argv[2] === 'completion-server') {
    const { parseCompLine } = await import('./lib/completion.js')
    const compWords = parseCompLine(process.env.COMP_LINE ?? '')
    const compCmd = compWords.find((w) => !w.startsWith('-') && w in commands)

    const toLoad = ['completion', ...(compCmd && compCmd !== 'completion' ? [compCmd] : [])]
    for (const name of toLoad) {
        const idx = program.commands.findIndex((c) => c.name() === name)
        if (idx !== -1) (program.commands as Command[]).splice(idx, 1)
    }
    await Promise.all(
        toLoad.map(async (name) => {
            const register = await commands[name][1]()
            register(program)
        }),
    )
} else {
    // Find which command (if any) is being invoked — match only known command names
    // to avoid treating option values (e.g. --progress-jsonl /tmp/out) as commands
    const commandName = process.argv.slice(2).find((a) => !a.startsWith('-') && a in commands)

    if (commandName && commands[commandName]) {
        // Remove placeholder, load real command module, register it
        const idx = program.commands.findIndex((c) => c.name() === commandName)
        if (idx !== -1) (program.commands as Command[]).splice(idx, 1)
        const loader = commands[commandName][1]

        startEarlySpinner()
        try {
            const register = await loader()
            register(program)
        } catch (err) {
            stopEarlySpinner()
            throw err
        }
    }
}

// Initialize verbose logger before parsing so it captures all -v flags
initializeLogger()

program
    .parseAsync()
    .catch((err: Error) => {
        console.error(err.message)
        process.exit(1)
    })
    .finally(() => stopEarlySpinner())

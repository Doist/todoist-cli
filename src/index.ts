#!/usr/bin/env node

import { type Command, program } from 'commander'
import packageJson from '../package.json' with { type: 'json' }
import { CliError } from './lib/errors.js'
import {
    getRequestedUserRef,
    isJsonMode,
    isNdjsonMode,
    isRawMode,
    stripUserFlag,
} from './lib/global-args.js'
import { initializeLogger } from './lib/logger.js'
import { preloadMarkdown } from './lib/markdown.js'
import { formatError, formatErrorJson } from './lib/output.js'
import { startEarlySpinner, stopEarlySpinner } from './lib/spinner.js'
import { setActiveCommandPath } from './lib/usage-tracking.js'

function getActionCommandPath(command: Command): string {
    const segments: string[] = []
    let current: Command | null = command

    while (current?.parent) {
        segments.push(current.name())
        current = current.parent
    }

    return `td ${segments.reverse().join(' ')}`
}

program
    .name('td')
    .description('Todoist CLI')
    .version(packageJson.version)
    .option('--no-spinner', 'Disable loading animations')
    .option('--progress-jsonl [path]', 'Output progress events as JSONL to stderr or file')
    .option('-v, --verbose', 'Increase output verbosity (repeat up to 4x: -v, -vv, -vvv, -vvvv)')
    .option('--accessible', 'Add text labels to color-coded output (also: TD_ACCESSIBLE=1)')
    .option('-q, --quiet', 'Suppress success messages (create commands still print the ID)')
    .option(
        '--user <ref>',
        'Run as a specific stored Todoist account (id or email). See `td user list`.',
    )
    .addHelpText(
        'after',
        `
Note for AI/LLM agents:
  Use "td task add" (not "td add") to create tasks with structured flags.
  Use --json or --ndjson flags for unambiguous, parseable output.
  Default JSON shows essential fields; use --full for all fields.
  Use --quiet to suppress success messages (create commands still print the ID).
  Use --user <id|email> on any command to act as a specific stored account.`,
    )

// Lazy command registry: [description, loader]
const commands: Record<string, [string, () => Promise<(p: Command) => void>]> = {
    add: [
        'Quick add task with natural language (e.g., "Buy milk tomorrow p1 #Shopping")',
        async () => (await import('./commands/add.js')).registerAddCommand,
    ],
    changelog: [
        'Show recent changelog entries',
        async () => (await import('./commands/changelog.js')).registerChangelogCommand,
    ],
    doctor: [
        'Diagnose common CLI setup and environment issues',
        async () => (await import('./commands/doctor.js')).registerDoctorCommand,
    ],
    hc: [
        'Search Todoist Help Center articles',
        async () => (await import('./commands/hc/index.js')).registerHelpCenterCommand,
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
        async () => (await import('./commands/completed/index.js')).registerCompletedCommand,
    ],
    task: [
        'Manage tasks',
        async () => (await import('./commands/task/index.js')).registerTaskCommand,
    ],
    project: [
        'Manage projects',
        async () => (await import('./commands/project/index.js')).registerProjectCommand,
    ],
    label: [
        'Manage labels',
        async () => (await import('./commands/label/index.js')).registerLabelCommand,
    ],
    comment: [
        'Manage comments',
        async () => (await import('./commands/comment/index.js')).registerCommentCommand,
    ],
    attachment: [
        'Manage file attachments',
        async () => (await import('./commands/attachment.js')).registerAttachmentCommand,
    ],
    section: [
        'Manage project sections',
        async () => (await import('./commands/section/index.js')).registerSectionCommand,
    ],
    workspace: [
        'Manage workspaces',
        async () => (await import('./commands/workspace/index.js')).registerWorkspaceCommand,
    ],
    activity: [
        'View activity logs',
        async () => (await import('./commands/activity.js')).registerActivityCommand,
    ],
    reminder: [
        'Manage task reminders',
        async () => (await import('./commands/reminder/index.js')).registerReminderCommand,
    ],
    settings: [
        'Manage user settings',
        async () => (await import('./commands/settings/index.js')).registerSettingsCommand,
    ],
    auth: [
        'Manage authentication',
        async () => (await import('./commands/auth/index.js')).registerAuthCommand,
    ],
    user: [
        'Manage stored Todoist accounts (multi-user)',
        async () => (await import('./commands/user/index.js')).registerUserCommand,
    ],
    apps: [
        'Manage your registered Todoist developer apps',
        async () => (await import('./commands/apps/index.js')).registerAppsCommand,
    ],
    backup: [
        'Manage backups',
        async () => (await import('./commands/backup/index.js')).registerBackupCommand,
    ],
    stats: [
        'View productivity stats and karma',
        async () => (await import('./commands/stats/index.js')).registerStatsCommand,
    ],
    filter: [
        'Manage filters',
        async () => (await import('./commands/filter/index.js')).registerFilterCommand,
    ],
    folder: [
        'Manage workspace folders',
        async () => (await import('./commands/folder/index.js')).registerFolderCommand,
    ],
    notification: [
        'Manage notifications',
        async () => (await import('./commands/notification/index.js')).registerNotificationCommand,
    ],
    skill: [
        'Manage coding agent skills/integrations',
        async () => (await import('./commands/skill/index.js')).registerSkillCommand,
    ],
    template: [
        'Manage project templates (export, import, create)',
        async () => (await import('./commands/template/index.js')).registerTemplateCommand,
    ],
    completion: [
        'Manage shell completions',
        async () => (await import('./commands/completion/index.js')).registerCompletionCommand,
    ],
    config: [
        'Manage CLI configuration',
        async () => (await import('./commands/config/index.js')).registerConfigCommand,
    ],
    view: [
        'View a Todoist entity or page by URL',
        async () => (await import('./commands/view.js')).registerViewCommand,
    ],
    update: [
        'Update the CLI to the latest version for the configured channel',
        async () => (await import('./commands/update/index.js')).registerUpdateCommand,
    ],
}

// Register placeholders so --help lists all commands
for (const [name, [description]] of Object.entries(commands)) {
    program.command(name).description(description)
}

program.hook('preAction', (_thisCommand, actionCommand) => {
    setActiveCommandPath(getActionCommandPath(actionCommand))
})

// Validate `--user` and strip it from argv before commander parses.
//
// Commander has no global-option attachment, so leaving `--user` in argv
// would make every subcommand error on it. We capture the value via
// `parseGlobalArgs` first and remove it here. Before stripping we surface
// usage errors that the parser can detect now but commander never will
// because it never sees the flag — bare `--user`, `--user=` (empty), and
// `--user <known-subcommand>` (almost always a forgotten value).
{
    const originalArgs = process.argv.slice(2)
    const sawUserFlag = originalArgs.some((a) => a === '--user' || a.startsWith('--user='))
    if (sawUserFlag) {
        const ref = getRequestedUserRef()
        const reportUserFlagError = (message: string, hints: string[]): never => {
            const err = new CliError('USER_FLAG_INVALID', message, hints)
            console.error(isJsonMode() ? formatErrorJson(err) : formatError(err))
            process.exit(1)
        }
        if (!ref) {
            reportUserFlagError('--user requires a value: <id|email>.', [
                'Example: td --user scott@doist.com task list',
            ])
        } else if (Object.hasOwn(commands, ref)) {
            reportUserFlagError(
                `--user requires a value: <id|email>. Got "${ref}", which looks like a subcommand — did you forget the value?`,
                [`Example: td --user scott@doist.com ${ref}`],
            )
        }
    }
    process.argv = [process.argv[0], process.argv[1], ...stripUserFlag(originalArgs)]
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
            // Preload markdown renderer in parallel with the command module
            // when output will be pretty-printed (not JSON/NDJSON/raw)
            const noMarkdownCommands = new Set([
                'backup',
                'changelog',
                'doctor',
                'update',
                'completion',
            ])
            const needsMarkdown =
                !noMarkdownCommands.has(commandName) &&
                !isJsonMode() &&
                !isNdjsonMode() &&
                !isRawMode()
            const markdownReady = needsMarkdown ? preloadMarkdown() : undefined

            const register = await loader()
            await markdownReady
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
        if (err instanceof CliError) {
            console.error(isJsonMode() ? formatErrorJson(err) : formatError(err))
        } else {
            console.error(
                isJsonMode() ? formatErrorJson('INTERNAL_ERROR', err.message) : err.message,
            )
        }
        process.exit(1)
    })
    .finally(() => stopEarlySpinner())

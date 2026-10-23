import { Command } from 'commander'
import { clearStatus } from './clear.js'
import { setStatus } from './set.js'
import { viewStatus } from './view.js'

export function registerStatusCommand(program: Command): void {
    const status = program
        .command('status')
        .description('Show, set or clear your status')
        .addHelpText(
            'after',
            `
Examples:
  td status
  td status set "Deep work" --emoji 🎯 --for 2h
  td status clear`,
        )

    status
        .command('view', { isDefault: true })
        .description('Show your current status')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .addHelpText(
            'after',
            `
Examples:
  td status
  td status --json`,
        )
        .action(viewStatus)

    status
        .command('set [message]')
        .description('Set your status, replacing any current one')
        .option('--emoji <emoji>', 'Emoji to show next to the message')
        .option(
            '--until <datetime>',
            'When the status ends: YYYY-MM-DD, YYYY-MM-DDTHH:MM or a full ISO 8601 timestamp. Local time unless it has Z or an offset',
        )
        .option('--for <duration>', 'How long the status lasts, e.g. 30m, 2h, 1d, 1h30m')
        .option(
            '--pause-notifications',
            'Hold back notifications while the status is active. Only apps that read the status honour it (Comms today, not Todoist yet)',
        )
        .option(
            '--pause-activity',
            'Ask for your Karma and streaks to be protected while the status is active, as Vacation Mode does. Only apps that read the status honour it (not Todoist yet). Independent of --pause-notifications',
        )
        .option('--dry-run', 'Show what would be set without setting it')
        .option('--json', 'Output as JSON')
        .addHelpText(
            'after',
            `
The message is 1 to 80 characters. The status is shared with your Todoist account, so other
apps that read it show it too. --pause-notifications is stored on the status but only affects apps that read
it; Todoist does not hold back its own notifications yet. --pause-activity is separate: it
asks for your Karma to stay put and your streaks to be protected, and does not silence notifications.
Todoist does not act on it yet either.

Examples:
  td status set "On holiday" --emoji 🏝️ --until 2026-10-20T09:00
  td status set "Deep work" --emoji 🎯 --for 2h --pause-notifications`,
        )
        .action(setStatus)

    status
        .command('clear')
        .description('Clear your status')
        .option('--dry-run', 'Show what would be cleared without clearing it')
        .action(clearStatus)
}

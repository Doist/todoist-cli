import { Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from '../../lib/completion.js'
import {
    boolOption,
    DATE_FORMAT_CHOICES,
    DAY_CHOICES,
    formatThemeList,
    THEME_CHOICES,
    TIME_FORMAT_CHOICES,
} from './helpers.js'
import { updateSettings } from './update.js'
import { viewSettings } from './view.js'

// Re-export public symbols consumed by tests
export {
    DATE_FORMAT_CHOICES,
    DAY_CHOICES,
    parseDateFormat,
    parseDay,
    parseTheme,
    parseTimeFormat,
    THEME_CHOICES,
    TIME_FORMAT_CHOICES,
} from './helpers.js'

export function registerSettingsCommand(program: Command): void {
    const settings = program.command('settings').description('Manage user settings')

    settings
        .command('view')
        .description('View current settings')
        .option('--json', 'Output as JSON')
        .action(viewSettings)

    settings
        .command('update')
        .description('Update settings')
        .option('--timezone <tz>', 'Timezone (e.g., UTC, Europe/London)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--time-format <format>', 'Time format: 12 or 24'),
                TIME_FORMAT_CHOICES,
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--date-format <format>', 'Date format: us (MM-DD) or intl (DD-MM)'),
                DATE_FORMAT_CHOICES,
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--start-day <day>', 'Week start: monday, tuesday, etc.'),
                DAY_CHOICES,
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--theme <name>', 'Theme: todoist, dark, moonstone, tangerine, etc.'),
                THEME_CHOICES,
            ),
        )
        .option('--auto-reminder <min>', 'Default reminder minutes (0 to disable)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--next-week <day>', '"Next week" day: monday, tuesday, etc.'),
                DAY_CHOICES,
            ),
        )
        .option('--start-page <page>', 'Default view: inbox, today, or project URL')
        .addOption(boolOption('--reminder-push <bool>', 'Push reminders: on/off'))
        .addOption(boolOption('--reminder-desktop <bool>', 'Desktop reminders: on/off'))
        .addOption(boolOption('--reminder-email <bool>', 'Email reminders: on/off'))
        .addOption(
            boolOption('--completed-sound-desktop <bool>', 'Desktop completion sound: on/off'),
        )
        .addOption(boolOption('--completed-sound-mobile <bool>', 'Mobile completion sound: on/off'))
        .action(async (options, command: Command) => {
            const hasOptions = Object.values(options).some((v: unknown) => v !== undefined)
            if (!hasOptions) {
                command.help()
                return
            }
            await updateSettings(options)
        })

    settings
        .command('themes')
        .description('List available themes')
        .action(() => {
            console.log(formatThemeList())
        })
}

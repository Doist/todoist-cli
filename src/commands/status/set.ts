import type { UserStatus, UserStatusArgs } from '@doist/todoist-sdk'
import type { Command } from 'commander'
import { pickDefined } from '../../lib/api/core.js'
import { writeUserStatus } from '../../lib/api/user-status.js'
import { formatDateTime, parseLocalDate } from '../../lib/dates.js'
import { parseDurationMs } from '../../lib/duration.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { failWithUsage } from '../../lib/missing-argument.js'
import type { DryRunOption, ViewOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { formatStatus } from '../../lib/status.js'

const MAX_MESSAGE_LENGTH = 80

type SetStatusOptions = ViewOptions &
    DryRunOption & {
        emoji?: string
        until?: string
        for?: string
        pauseNotifications?: boolean
        pauseActivity?: boolean
    }

function resolveMessage(message: string): string {
    const trimmed = message.trim()
    const length = [...trimmed].length
    if (length < 1 || length > MAX_MESSAGE_LENGTH) {
        throw new CliError(
            'INVALID_OPTIONS',
            `The message must be 1 to ${MAX_MESSAGE_LENGTH} characters`,
        )
    }
    return trimmed
}

function resolveEmoji(emoji: string | undefined): string | undefined {
    if (emoji === undefined) return undefined
    const trimmed = emoji.trim()
    if (trimmed === '') {
        throw new CliError('INVALID_OPTIONS', '--emoji cannot be empty')
    }
    if (trimmed.startsWith('-')) {
        throw new CliError('INVALID_OPTIONS', `--emoji needs an emoji, got ${trimmed}`, [
            'Put the emoji right after --emoji; a flag there is read as its value',
        ])
    }
    return trimmed
}

function resolveExpiry(options: SetStatusOptions): Date | undefined {
    if (options.until !== undefined && options.for !== undefined) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use --until and --for together')
    }

    let expiry: Date | undefined
    if (options.until !== undefined) {
        expiry = parseLocalDate(options.until) ?? undefined
        if (!expiry) {
            throw new CliError('INVALID_DATE', `Invalid --until date: ${options.until}`, [
                'Use a real date as YYYY-MM-DD or YYYY-MM-DDTHH:MM (local time), or add Z or an offset such as +02:00',
            ])
        }
    } else if (options.for !== undefined) {
        const duration = parseDurationMs(options.for)
        expiry = duration === null ? undefined : new Date(Date.now() + duration)
        if (!expiry || Number.isNaN(expiry.getTime())) {
            throw new CliError('INVALID_DURATION', `Invalid --for duration: ${options.for}`, [
                'Use minutes, hours or days, e.g. 30m, 2h, 1d or 1h30m',
            ])
        }
    }

    if (expiry && expiry.getTime() <= Date.now()) {
        const dateOnly =
            options.until !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(options.until.trim())
        throw new CliError(
            'INVALID_DATE',
            `The status must end in the future: ${formatDateTime(expiry)}`,
            [
                dateOnly
                    ? 'A date with no time means midnight at its start, so add a time or use a later date'
                    : 'Use a date or time in the future',
            ],
        )
    }
    return expiry
}

// `--for` sends an expiry with milliseconds, and the server may store only whole seconds.
const EXPIRY_TOLERANCE_MS = 1000

function sameExpiry(returned: Date | null | undefined, sent: UserStatusArgs['activeUntil']) {
    if (!returned || !sent) return !returned && !sent
    return Math.abs(returned.getTime() - new Date(sent).getTime()) < EXPIRY_TOLERANCE_MS
}

type EffectArgs = NonNullable<UserStatusArgs['effects']>['pauseNotifications']

// A present effect is compared by its scope too, so a different scope reads as a change.
function sameEffect(returned: UserStatus['effects']['pauseNotifications'], sent: EffectArgs) {
    if (!returned || !sent) return !returned && !sent
    return returned.scope?.mode === sent.scope?.mode
}

function buildEffects(options: SetStatusOptions): UserStatusArgs['effects'] {
    const effects = pickDefined({
        pauseNotifications: options.pauseNotifications
            ? ({ scope: { mode: 'all' } } as const)
            : undefined,
        pauseActivity: options.pauseActivity ? ({ scope: { mode: 'all' } } as const) : undefined,
    })
    return Object.keys(effects).length > 0 ? effects : undefined
}

function sameStatus(returned: UserStatus, sent: UserStatusArgs): boolean {
    return (
        returned.message === sent.message &&
        (returned.emoji || undefined) === sent.emoji &&
        sameEffect(returned.effects.pauseNotifications, sent.effects?.pauseNotifications) &&
        sameEffect(returned.effects.pauseActivity, sent.effects?.pauseActivity) &&
        sameExpiry(returned.activeUntil, sent.activeUntil)
    )
}

export async function setStatus(
    message: string | undefined,
    options: SetStatusOptions,
    command: Command,
): Promise<void> {
    if (message === undefined) {
        failWithUsage(command)
    }
    const text = resolveMessage(message)
    const emoji = resolveEmoji(options.emoji)
    const activeUntil = resolveExpiry(options)

    const args: UserStatusArgs = {
        message: text,
        ...pickDefined({
            emoji,
            activeUntil,
            effects: buildEffects(options),
        }),
    }

    if (options.dryRun) {
        if (options.json) {
            console.log(formatJson({ status: 'preview', command: 'td status set', args }))
            return
        }
        printDryRun('set status', {
            Message: text,
            Emoji: emoji,
            Until: activeUntil ? formatDateTime(activeUntil) : undefined,
            'Pause notifications': options.pauseNotifications ? 'yes' : undefined,
            'Pause activity': options.pauseActivity ? 'yes' : undefined,
        })
        return
    }

    const status = await writeUserStatus(args)

    if (!status) {
        throw new CliError(
            'INVALID_STATE',
            'Nothing changed: Todoist accepted the request but returned no active status',
            ['Run `td status` to see the current status'],
        )
    }
    // Anything else that writes your status (Comms, another client) can land between the write
    // and the read-back; say so rather than printing a status that is not the one just sent.
    if (!sameStatus(status, args)) {
        throw new CliError(
            'INVALID_STATE',
            `Todoist reports a different status than the one sent: ${formatStatus(status)}`,
            [
                'Another app may have changed your status at the same moment; run `td status set` again',
            ],
        )
    }

    if (options.json) {
        console.log(formatJson({ status }))
    } else if (!isQuiet()) {
        console.log(`Status set: ${formatStatus(status)}`)
    }
}

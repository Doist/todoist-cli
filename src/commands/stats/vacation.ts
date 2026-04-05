import type { Command } from 'commander'
import { updateGoals } from '../../lib/api/stats.js'
import { CliError } from '../../lib/errors.js'

interface VacationOptions {
    on?: boolean
    off?: boolean
}

export async function vacationCommand(options: VacationOptions, command: Command): Promise<void> {
    if (options.on && options.off) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --on and --off.')
    }

    if (!options.on && !options.off) {
        command.help()
        return
    }

    await updateGoals({ vacationMode: options.on === true })
    console.log(options.on ? 'Vacation mode enabled.' : 'Vacation mode disabled.')
}

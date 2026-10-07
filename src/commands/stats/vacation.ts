import type { Command } from 'commander'
import { updateGoals } from '../../lib/api/stats.js'
import { CliError } from '../../lib/errors.js'
import { failWithUsage } from '../../lib/missing-argument.js'
import { printDryRun } from '../../lib/output.js'

interface VacationOptions {
    on?: boolean
    off?: boolean
    dryRun?: boolean
}

export async function vacationCommand(options: VacationOptions, command: Command): Promise<void> {
    if (options.on && options.off) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --on and --off.')
    }

    if (!options.on && !options.off) {
        failWithUsage(command)
        return
    }

    if (options.dryRun) {
        printDryRun('update vacation mode', { Enabled: String(options.on === true) })
        return
    }

    await updateGoals({ vacationMode: options.on === true })
    console.log(options.on ? 'Vacation mode enabled.' : 'Vacation mode disabled.')
}

import type { Command } from 'commander'
import { updateGoals } from '../../lib/api/stats.js'
import { CliError } from '../../lib/errors.js'
import { failWithUsage } from '../../lib/missing-argument.js'
import { printDryRun } from '../../lib/output.js'

interface GoalsOptions {
    daily?: string
    weekly?: string
    dryRun?: boolean
}

export async function goalsCommand(options: GoalsOptions, command: Command): Promise<void> {
    const hasOptions = options.daily !== undefined || options.weekly !== undefined
    if (!hasOptions) {
        failWithUsage(command)
        return
    }

    const args: Parameters<typeof updateGoals>[0] = {}

    if (options.daily !== undefined) {
        const daily = parseInt(options.daily, 10)
        if (Number.isNaN(daily) || daily < 0) {
            throw new CliError('INVALID_GOAL', 'Daily goal must be a non-negative number.')
        }
        args.dailyGoal = daily
    }

    if (options.weekly !== undefined) {
        const weekly = parseInt(options.weekly, 10)
        if (Number.isNaN(weekly) || weekly < 0) {
            throw new CliError('INVALID_GOAL', 'Weekly goal must be a non-negative number.')
        }
        args.weeklyGoal = weekly
    }

    if (options.dryRun) {
        printDryRun('update goals', {
            Daily: args.dailyGoal?.toString(),
            Weekly: args.weeklyGoal?.toString(),
        })
        return
    }

    await updateGoals(args)
    console.log('Goals updated.')
}

import type { Command } from 'commander'
import { updateGoals } from '../../lib/api/stats.js'

interface GoalsOptions {
    daily?: string
    weekly?: string
}

export async function goalsCommand(options: GoalsOptions, command: Command): Promise<void> {
    const hasOptions = options.daily !== undefined || options.weekly !== undefined
    if (!hasOptions) {
        command.help()
        return
    }

    const args: Parameters<typeof updateGoals>[0] = {}

    if (options.daily !== undefined) {
        const daily = parseInt(options.daily, 10)
        if (Number.isNaN(daily) || daily < 0) {
            throw new Error('Daily goal must be a non-negative number.')
        }
        args.dailyGoal = daily
    }

    if (options.weekly !== undefined) {
        const weekly = parseInt(options.weekly, 10)
        if (Number.isNaN(weekly) || weekly < 0) {
            throw new Error('Weekly goal must be a non-negative number.')
        }
        args.weeklyGoal = weekly
    }

    await updateGoals(args)
    console.log('Goals updated.')
}

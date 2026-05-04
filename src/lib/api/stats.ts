import { createCommand, type ProductivityStats } from '@doist/todoist-sdk'
import { CliError } from '../errors.js'
import { getApi, pickDefined } from './core.js'

export async function fetchProductivityStats(): Promise<ProductivityStats> {
    const api = await getApi()
    return api.getProductivityStats()
}

export interface UpdateGoalsArgs {
    dailyGoal?: number
    weeklyGoal?: number
    vacationMode?: boolean
    karmaDisabled?: boolean
}

export async function updateGoals(args: UpdateGoalsArgs): Promise<void> {
    const goalsArgs = pickDefined({
        dailyGoal: args.dailyGoal,
        weeklyGoal: args.weeklyGoal,
        vacationMode: args.vacationMode,
        karmaDisabled: args.karmaDisabled,
    })

    if (Object.keys(goalsArgs).length === 0) {
        throw new CliError('NO_CHANGES', 'No goals to update')
    }

    const api = await getApi()
    await api.sync({
        commands: [createCommand('update_goals', goalsArgs)],
    })
}

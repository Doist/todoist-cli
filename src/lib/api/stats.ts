import { getApiToken } from '../auth.js'
import { executeSyncCommand, generateUuid, type SyncCommand } from './core.js'

export interface Streak {
    count: number
    start: string
    end: string
}

export interface ProductivityStats {
    karma: number
    karmaTrend: string
    karmaLastUpdate: number
    completedCount: number
    daysItems: Array<{ date: string; totalCompleted: number }>
    weekItems: Array<{ from: string; to: string; totalCompleted: number }>
    goals: {
        dailyGoal: number
        weeklyGoal: number
        currentDailyStreak: Streak
        currentWeeklyStreak: Streak
        maxDailyStreak: Streak
        maxWeeklyStreak: Streak
        vacationMode: boolean
        karmaDisabled: boolean
        ignoreDays: number[]
    }
}

const defaultStreak: Streak = { count: 0, start: '', end: '' }

function parseStreak(s: unknown): Streak {
    if (!s || typeof s !== 'object') return defaultStreak
    const obj = s as Record<string, unknown>
    return {
        count: Number(obj.count ?? 0),
        start: String(obj.start ?? ''),
        end: String(obj.end ?? ''),
    }
}

export async function fetchProductivityStats(): Promise<ProductivityStats> {
    const token = await getApiToken()
    const response = await fetch('https://api.todoist.com/api/v1/tasks/completed/stats', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch productivity stats: ${response.status}`)
    }

    const data = await response.json()
    if (data.error) {
        throw new Error(`Productivity stats API error: ${data.error}`)
    }

    const goals = data.goals ?? {}
    return {
        karma: Number(data.karma ?? 0),
        karmaTrend: String(data.karma_trend ?? 'none'),
        karmaLastUpdate: Number(data.karma_last_update ?? 0),
        completedCount: Number(data.completed_count ?? 0),
        daysItems: (data.days_items ?? []).map((d: { date: string; total_completed: number }) => ({
            date: d.date,
            totalCompleted: d.total_completed,
        })),
        weekItems: (data.week_items ?? []).map(
            (w: { from: string; to: string; total_completed: number }) => ({
                from: w.from,
                to: w.to,
                totalCompleted: w.total_completed,
            }),
        ),
        goals: {
            dailyGoal: Number(goals.daily_goal ?? 0),
            weeklyGoal: Number(goals.weekly_goal ?? 0),
            currentDailyStreak: parseStreak(goals.current_daily_streak),
            currentWeeklyStreak: parseStreak(goals.current_weekly_streak),
            maxDailyStreak: parseStreak(goals.max_daily_streak),
            maxWeeklyStreak: parseStreak(goals.max_weekly_streak),
            vacationMode: Boolean(goals.vacation_mode),
            karmaDisabled: Boolean(goals.karma_disabled),
            ignoreDays: (goals.ignore_days ?? []) as number[],
        },
    }
}

export interface UpdateGoalsArgs {
    dailyGoal?: number
    weeklyGoal?: number
    vacationMode?: boolean
    karmaDisabled?: boolean
    ignoreDays?: number[]
}

export async function updateGoals(args: UpdateGoalsArgs): Promise<void> {
    const goalsArgs: Record<string, unknown> = {}
    if (args.dailyGoal !== undefined) goalsArgs.daily_goal = args.dailyGoal
    if (args.weeklyGoal !== undefined) goalsArgs.weekly_goal = args.weeklyGoal
    if (args.vacationMode !== undefined) goalsArgs.vacation_mode = args.vacationMode ? 1 : 0
    if (args.karmaDisabled !== undefined) goalsArgs.karma_disabled = args.karmaDisabled ? 1 : 0
    if (args.ignoreDays !== undefined) goalsArgs.ignore_days = args.ignoreDays

    if (Object.keys(goalsArgs).length === 0) {
        throw new Error('No goals to update')
    }

    const command: SyncCommand = {
        type: 'update_goals',
        uuid: generateUuid(),
        args: goalsArgs,
    }

    await executeSyncCommand([command])
}

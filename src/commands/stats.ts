import chalk from 'chalk'
import { Command } from 'commander'
import {
    fetchProductivityStats,
    type ProductivityStats,
    type Streak,
    updateGoals,
} from '../lib/api/stats.js'

function formatTrend(trend: string): string {
    switch (trend) {
        case 'up':
            return chalk.green('\u2191')
        case 'down':
            return chalk.red('\u2193')
        default:
            return ''
    }
}

function formatStreak(current: Streak, max: Streak): string {
    if (current.count === 0 && max.count === 0) return chalk.dim('none')
    const best = max.count > current.count ? ` (best: ${max.count})` : ''
    return `${current.count}${best}`
}

function formatGoalProgress(completed: number, goal: number, label: string): string {
    if (goal === 0) return chalk.dim('no goal set')
    const ratio = `${completed}/${goal}`
    const met = completed >= goal
    const progress = met ? chalk.green(ratio) : chalk.yellow(ratio)
    return `${progress} ${label}`
}

function getTodayCompleted(stats: ProductivityStats): number {
    const today = new Date().toISOString().slice(0, 10)
    const todayItem = stats.daysItems.find((d) => d.date === today)
    return todayItem?.totalCompleted ?? 0
}

function getThisWeekCompleted(stats: ProductivityStats): number {
    if (stats.weekItems.length === 0) return 0
    return stats.weekItems[0].totalCompleted
}

function formatStatsView(stats: ProductivityStats): string {
    const lines: string[] = []
    const { goals } = stats

    if (goals.vacationMode) {
        lines.push(chalk.yellow('Vacation mode is on'))
        lines.push('')
    }

    const trend = formatTrend(stats.karmaTrend)
    lines.push(`Karma: ${stats.karma.toLocaleString()} ${trend}`)
    lines.push('')

    const todayCompleted = getTodayCompleted(stats)
    const weekCompleted = getThisWeekCompleted(stats)

    const dailyProgress = formatGoalProgress(todayCompleted, goals.dailyGoal, 'today')
    const dailyStreak = formatStreak(goals.currentDailyStreak, goals.maxDailyStreak)
    lines.push(
        `Daily:  ${goals.dailyGoal} tasks   ${dailyProgress.padEnd(20)} streak: ${dailyStreak}`,
    )

    const weeklyProgress = formatGoalProgress(weekCompleted, goals.weeklyGoal, 'this week')
    const weeklyStreak = formatStreak(goals.currentWeeklyStreak, goals.maxWeeklyStreak)
    lines.push(
        `Weekly: ${goals.weeklyGoal} tasks   ${weeklyProgress.padEnd(20)} streak: ${weeklyStreak}`,
    )

    lines.push('')
    lines.push(`Completed: ${stats.completedCount.toLocaleString()} total`)

    return lines.join('\n')
}

function formatStatsJson(stats: ProductivityStats, full: boolean): object {
    const base = {
        karma: stats.karma,
        karmaTrend: stats.karmaTrend,
        completedCount: stats.completedCount,
        goals: {
            dailyGoal: stats.goals.dailyGoal,
            weeklyGoal: stats.goals.weeklyGoal,
            currentDailyStreak: stats.goals.currentDailyStreak,
            currentWeeklyStreak: stats.goals.currentWeeklyStreak,
            maxDailyStreak: stats.goals.maxDailyStreak,
            maxWeeklyStreak: stats.goals.maxWeeklyStreak,
            vacationMode: stats.goals.vacationMode,
        },
    }

    if (!full) return base

    return {
        ...base,
        karmaLastUpdate: stats.karmaLastUpdate,
        goals: {
            ...base.goals,
            karmaDisabled: stats.goals.karmaDisabled,
            ignoreDays: stats.goals.ignoreDays,
        },
        daysItems: stats.daysItems,
        weekItems: stats.weekItems,
    }
}

interface ViewOptions {
    json?: boolean
    full?: boolean
}

async function viewStats(options: ViewOptions): Promise<void> {
    const stats = await fetchProductivityStats()

    if (options.json) {
        console.log(JSON.stringify(formatStatsJson(stats, options.full ?? false), null, 2))
        return
    }

    console.log(formatStatsView(stats))
}

interface GoalsOptions {
    daily?: string
    weekly?: string
}

async function goalsCommand(options: GoalsOptions, command: Command): Promise<void> {
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

interface VacationOptions {
    on?: boolean
    off?: boolean
}

async function vacationCommand(options: VacationOptions, command: Command): Promise<void> {
    if (options.on && options.off) {
        throw new Error('Cannot use both --on and --off.')
    }

    if (!options.on && !options.off) {
        command.help()
        return
    }

    await updateGoals({ vacationMode: options.on === true })
    console.log(options.on ? 'Vacation mode enabled.' : 'Vacation mode disabled.')
}

export function registerStatsCommand(program: Command): void {
    const stats = program
        .command('stats')
        .description('View productivity stats and karma')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(viewStats)

    stats
        .command('goals')
        .description('Update daily/weekly goals')
        .option('--daily <n>', 'Set daily goal (tasks per day)')
        .option('--weekly <n>', 'Set weekly goal (tasks per week)')
        .action(goalsCommand)

    stats
        .command('vacation')
        .description('Toggle vacation mode')
        .option('--on', 'Enable vacation mode')
        .option('--off', 'Disable vacation mode')
        .action(vacationCommand)
}

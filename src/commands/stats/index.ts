import { Command } from 'commander'
import { goalsCommand } from './goals.js'
import { vacationCommand } from './vacation.js'
import { viewStats } from './view.js'

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

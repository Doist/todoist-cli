import { Command } from 'commander'
import { listFilters } from './filter.js'

export function registerFiltersCommand(program: Command): void {
    const filters = program.command('filters').description('List saved filters')

    filters
        .command('list', { isDefault: true })
        .description('List all filters')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each filter')
        .action(listFilters)
}

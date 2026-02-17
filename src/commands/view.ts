import { Command } from 'commander'
import { formatError } from '../lib/output.js'
import { classifyTodoistUrl } from '../lib/refs.js'
import { registerFilterCommand } from './filter.js'
import { registerLabelCommand } from './label.js'
import { registerProjectCommand } from './project.js'
import { registerTaskCommand } from './task.js'
import { registerTodayCommand } from './today.js'
import { registerUpcomingCommand } from './upcoming.js'

async function runRoutedCommand(
    register: (program: Command) => void,
    argv: string[],
): Promise<void> {
    const proxy = new Command()
    proxy.exitOverride()
    register(proxy)
    await proxy.parseAsync(['node', 'td', ...argv])
}

export function registerViewCommand(program: Command): void {
    program
        .command('view <url> [args...]')
        .description('View a Todoist entity or page by URL')
        .allowUnknownOption(true)
        .addHelpText(
            'after',
            `
Route mapping:
  /app/task/...       -> td task view <ref>
  /app/project/...    -> td project view <ref>
  /app/label/...      -> td label view <ref>
  /app/filter/...     -> td filter show <ref>
  /app/today          -> td today
  /app/upcoming       -> td upcoming

Examples:
  td view https://app.todoist.com/app/task/buy-milk-abc123
  td view https://app.todoist.com/app/filter/work-tasks-def456 --json
  td view https://app.todoist.com/app/filter/work-tasks-def456 --limit 25 --ndjson`,
        )
        .action(async (url: string, args: string[]) => {
            const route = classifyTodoistUrl(url)
            if (!route) {
                throw new Error(formatError('INVALID_URL', `Not a recognized Todoist URL: ${url}`))
            }

            if (route.kind === 'view') {
                switch (route.view) {
                    case 'today':
                        return runRoutedCommand(registerTodayCommand, ['today', ...args])
                    case 'upcoming':
                        return runRoutedCommand(registerUpcomingCommand, ['upcoming', ...args])
                }
            }

            const ref = `id:${route.id}`
            switch (route.entityType) {
                case 'task':
                    return runRoutedCommand(registerTaskCommand, ['task', 'view', ref, ...args])
                case 'project':
                    return runRoutedCommand(registerProjectCommand, [
                        'project',
                        'view',
                        ref,
                        ...args,
                    ])
                case 'label':
                    return runRoutedCommand(registerLabelCommand, ['label', 'view', ref, ...args])
                case 'filter':
                    return runRoutedCommand(registerFilterCommand, ['filter', 'show', ref, ...args])
            }
        })
}

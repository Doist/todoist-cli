import { Command } from 'commander'
import type { ViewOptions } from '../lib/options.js'
import { formatError } from '../lib/output.js'
import { classifyTodoistUrl } from '../lib/refs.js'
import { showFilter } from './filter.js'
import { viewLabel } from './label.js'
import { viewProject } from './project.js'
import { viewTask } from './task.js'
import { showToday } from './today.js'
import { showUpcoming } from './upcoming.js'

export function registerViewCommand(program: Command): void {
    program
        .command('view <url>')
        .description('View a Todoist entity or page by URL')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in output')
        .option('--raw', 'Disable markdown rendering')
        .action(async (url: string, options: ViewOptions) => {
            const route = classifyTodoistUrl(url)
            if (!route) {
                throw new Error(formatError('INVALID_URL', `Not a recognized Todoist URL: ${url}`))
            }

            if (route.kind === 'view') {
                switch (route.view) {
                    case 'today':
                        return showToday(options)
                    case 'upcoming':
                        return showUpcoming(undefined, options)
                }
            }

            const ref = `id:${route.id}`
            switch (route.entityType) {
                case 'task':
                    return viewTask(ref, options)
                case 'project':
                    return viewProject(ref, options)
                case 'label':
                    return viewLabel(ref, options)
                case 'filter':
                    return showFilter(ref, options)
            }
        })
}

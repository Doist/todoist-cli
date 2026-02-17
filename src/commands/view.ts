import { Command } from 'commander'
import { formatError } from '../lib/output.js'

type RoutableCommand =
    | 'task'
    | 'project'
    | 'inbox'
    | 'today'
    | 'upcoming'
    | 'settings'
    | 'filter'
    | 'label'

function extractIdFromSlug(slugAndId: string): string {
    const lastHyphenIndex = slugAndId.lastIndexOf('-')
    return lastHyphenIndex === -1 ? slugAndId : slugAndId.slice(lastHyphenIndex + 1)
}

export function routeViewUrl(url: string): string[] | null {
    let parsed: URL

    try {
        parsed = new URL(url)
    } catch {
        return null
    }

    if (
        (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
        parsed.hostname !== 'app.todoist.com'
    ) {
        return null
    }

    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments[0] !== 'app') return null

    const pathSegments = segments.slice(1)
    if (pathSegments.length === 0) return null

    const [entityPath, slugAndId] = pathSegments

    if (entityPath === 'inbox') return ['inbox']
    if (entityPath === 'today') return ['today']
    if (entityPath === 'upcoming') return ['upcoming']
    if (entityPath === 'settings') return ['settings', 'view']

    if (!slugAndId) return null
    const id = extractIdFromSlug(slugAndId)

    if (entityPath === 'task') return ['task', 'view', `id:${id}`]
    if (entityPath === 'project') return ['project', 'view', `id:${id}`]
    if (entityPath === 'filter') return ['filter', 'show', `id:${id}`]
    if (entityPath === 'label') return ['label', 'view', `id:${id}`]

    return null
}

async function loadCommand(name: RoutableCommand): Promise<(program: Command) => void> {
    switch (name) {
        case 'task':
            return (await import('./task.js')).registerTaskCommand
        case 'project':
            return (await import('./project.js')).registerProjectCommand
        case 'inbox':
            return (await import('./inbox.js')).registerInboxCommand
        case 'today':
            return (await import('./today.js')).registerTodayCommand
        case 'upcoming':
            return (await import('./upcoming.js')).registerUpcomingCommand
        case 'settings':
            return (await import('./settings.js')).registerSettingsCommand
        case 'filter':
            return (await import('./filter.js')).registerFilterCommand
        case 'label':
            return (await import('./label.js')).registerLabelCommand
    }
}

export async function runRoutedCommand(args: string[]): Promise<void> {
    const commandName = args[0] as RoutableCommand
    const registerCommand = await loadCommand(commandName)
    const program = new Command()
    program.exitOverride()
    registerCommand(program)
    await program.parseAsync(['node', 'td', ...args])
}

export function registerViewCommand(program: Command): void {
    program
        .command('view <url>')
        .description('Route supported Todoist web app URLs to matching td commands')
        .addHelpText(
            'after',
            `
Routes:
  /app/task/...      -> td task view id:<id>
  /app/project/...   -> td project view id:<id>
  /app/filter/...    -> td filter show id:<id>
  /app/label/...     -> td label view id:<id>
  /app/inbox|today|upcoming|settings -> matching command

Examples:
  td view https://app.todoist.com/app/task/buy-milk-abc123
  td view https://app.todoist.com/app/project/work-xyz789
  td view https://app.todoist.com/app/filter/unscheduled-2353370974
  td view https://app.todoist.com/app/label/this-week-2183057949
  td view https://app.todoist.com/app/today`,
        )
        .action(async (url: string) => {
            const route = routeViewUrl(url)
            if (!route) {
                throw new Error(
                    formatError('UNSUPPORTED_URL', `Unsupported Todoist URL: "${url}"`, [
                        'Supported paths: /app/task, /app/project, /app/filter, /app/label, /app/inbox, /app/today, /app/upcoming, /app/settings',
                        'Example: td view https://app.todoist.com/app/task/buy-milk-abc123',
                    ]),
                )
            }

            await runRoutedCommand(route)
        })
}

import { Command } from 'commander'
import { formatError } from '../lib/output.js'
import { parseTodoistUrl } from '../lib/refs.js'

type RoutableCommand = 'task' | 'project' | 'inbox' | 'today' | 'upcoming' | 'settings'

export function routeViewUrl(url: string): string[] | null {
    const parsedEntity = parseTodoistUrl(url)
    if (parsedEntity?.entityType === 'task') {
        return ['task', 'view', `id:${parsedEntity.id}`]
    }
    if (parsedEntity?.entityType === 'project') {
        return ['project', 'view', `id:${parsedEntity.id}`]
    }

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

    const path = parsed.pathname.replace(/^\/+|\/+$/g, '')
    if (!path.startsWith('app')) return null
    const appPath = path.slice('app'.length).replace(/^\/+/, '')

    if (appPath === 'inbox') return ['inbox']
    if (appPath === 'today') return ['today']
    if (appPath === 'upcoming') return ['upcoming']
    if (appPath === 'settings' || appPath.startsWith('settings/')) return ['settings', 'view']

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
        .description('Route Todoist web app URLs to the matching td command')
        .action(async (url: string) => {
            const routedArgs = routeViewUrl(url)
            if (!routedArgs) {
                throw new Error(
                    formatError('UNSUPPORTED_URL', `Unsupported Todoist URL: "${url}"`, [
                        'Supported URLs: task, project, inbox, today, upcoming, settings',
                        'Example: td view https://app.todoist.com/app/task/buy-milk-abc123',
                    ]),
                )
            }

            await runRoutedCommand(routedArgs)
        })
}

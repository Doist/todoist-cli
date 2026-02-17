import { Command } from 'commander'
import { getApi } from '../lib/api/core.js'
import { formatError } from '../lib/output.js'

type RoutableCommand = 'task' | 'project' | 'inbox' | 'today' | 'upcoming' | 'settings' | 'filter'

type ViewRoute = { kind: 'command'; args: string[] } | { kind: 'label'; id: string }

function extractIdFromSlug(slugAndId: string): string {
    const lastHyphenIndex = slugAndId.lastIndexOf('-')
    return lastHyphenIndex === -1 ? slugAndId : slugAndId.slice(lastHyphenIndex + 1)
}

function isWorkspacePathSegment(segment: string): boolean {
    return /^\d+$/.test(segment)
}

export function routeViewUrl(url: string): ViewRoute | null {
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

    const segmentsWithoutWorkspace = isWorkspacePathSegment(pathSegments[0])
        ? pathSegments.slice(1)
        : pathSegments
    if (segmentsWithoutWorkspace.length === 0) return null

    const [entityPath, slugAndId] = segmentsWithoutWorkspace

    if (entityPath === 'inbox') return { kind: 'command', args: ['inbox'] }
    if (entityPath === 'today') return { kind: 'command', args: ['today'] }
    if (entityPath === 'upcoming') return { kind: 'command', args: ['upcoming'] }
    if (entityPath === 'settings') return { kind: 'command', args: ['settings', 'view'] }

    if (!slugAndId) return null
    const id = extractIdFromSlug(slugAndId)

    if (entityPath === 'task') return { kind: 'command', args: ['task', 'view', `id:${id}`] }
    if (entityPath === 'project') return { kind: 'command', args: ['project', 'view', `id:${id}`] }
    if (entityPath === 'filter') return { kind: 'command', args: ['filter', 'show', `id:${id}`] }
    if (entityPath === 'label') return { kind: 'label', id }

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
            const route = routeViewUrl(url)
            if (!route) {
                throw new Error(
                    formatError('UNSUPPORTED_URL', `Unsupported Todoist URL: "${url}"`, [
                        'Supported URLs: task, project, filter, label, inbox, today, upcoming, settings',
                        'Workspace filter URLs are also supported: /app/<workspaceId>/filter/...',
                        'Example: td view https://app.todoist.com/app/task/buy-milk-abc123',
                    ]),
                )
            }

            if (route.kind === 'command') {
                await runRoutedCommand(route.args)
                return
            }

            const api = await getApi()
            const label = await api.getLabel(route.id)
            await runRoutedCommand(['task', 'list', '--label', label.name])
        })
}

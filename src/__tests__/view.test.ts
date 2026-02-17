import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerViewCommand, routeViewUrl } from '../commands/view.js'
import { getApi } from '../lib/api/core.js'

const spies = vi.hoisted(() => ({
    taskView: vi.fn(),
    taskList: vi.fn(),
    projectView: vi.fn(),
    filterShow: vi.fn(),
    inbox: vi.fn(),
    today: vi.fn(),
    upcoming: vi.fn(),
    settingsView: vi.fn(),
}))

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../commands/task.js', () => ({
    registerTaskCommand: vi.fn((program: Command) => {
        const task = program.command('task')
        task.command('list')
            .option('--label <name>')
            .action((options: { label?: string }) => {
                spies.taskList(options.label)
            })
        task.command('view')
            .argument('<ref>')
            .action((ref: string) => spies.taskView(ref))
    }),
}))

vi.mock('../commands/project.js', () => ({
    registerProjectCommand: vi.fn((program: Command) => {
        program
            .command('project')
            .command('view')
            .argument('<ref>')
            .action((ref: string) => spies.projectView(ref))
    }),
}))

vi.mock('../commands/filter.js', () => ({
    registerFilterCommand: vi.fn((program: Command) => {
        program
            .command('filter')
            .command('show')
            .argument('<ref>')
            .action((ref: string) => spies.filterShow(ref))
    }),
}))

vi.mock('../commands/inbox.js', () => ({
    registerInboxCommand: vi.fn((program: Command) => {
        program.command('inbox').action(() => spies.inbox())
    }),
}))

vi.mock('../commands/today.js', () => ({
    registerTodayCommand: vi.fn((program: Command) => {
        program.command('today').action(() => spies.today())
    }),
}))

vi.mock('../commands/upcoming.js', () => ({
    registerUpcomingCommand: vi.fn((program: Command) => {
        program.command('upcoming').action(() => spies.upcoming())
    }),
}))

vi.mock('../commands/settings.js', () => ({
    registerSettingsCommand: vi.fn((program: Command) => {
        const settings = program.command('settings')
        settings.command('view').action(() => spies.settingsView())
    }),
}))

function createProgram(): Command {
    const program = new Command()
    program.exitOverride()
    registerViewCommand(program)
    return program
}

const mockGetApi = vi.mocked(getApi)

describe('routeViewUrl', () => {
    it('routes task URLs', () => {
        expect(routeViewUrl('https://app.todoist.com/app/task/buy-milk-abc123')).toEqual({
            kind: 'command',
            args: ['task', 'view', 'id:abc123'],
        })
    })

    it('routes project URLs', () => {
        expect(routeViewUrl('https://app.todoist.com/app/project/work-proj1')).toEqual({
            kind: 'command',
            args: ['project', 'view', 'id:proj1'],
        })
    })

    it('routes filter URLs', () => {
        expect(routeViewUrl('https://app.todoist.com/app/filter/unscheduled-2353370974')).toEqual({
            kind: 'command',
            args: ['filter', 'show', 'id:2353370974'],
        })
        expect(routeViewUrl('https://app.todoist.com/app/69/filter/q4-frontend-31')).toEqual({
            kind: 'command',
            args: ['filter', 'show', 'id:31'],
        })
    })

    it('routes label URLs', () => {
        expect(routeViewUrl('https://app.todoist.com/app/label/this-week-2183057949')).toEqual({
            kind: 'label',
            id: '2183057949',
        })
    })

    it('routes special view URLs', () => {
        expect(routeViewUrl('https://app.todoist.com/app/inbox')).toEqual({
            kind: 'command',
            args: ['inbox'],
        })
        expect(routeViewUrl('https://app.todoist.com/app/today')).toEqual({
            kind: 'command',
            args: ['today'],
        })
        expect(routeViewUrl('https://app.todoist.com/app/upcoming')).toEqual({
            kind: 'command',
            args: ['upcoming'],
        })
        expect(routeViewUrl('https://app.todoist.com/app/settings')).toEqual({
            kind: 'command',
            args: ['settings', 'view'],
        })
        expect(routeViewUrl('https://app.todoist.com/app/settings/account')).toEqual({
            kind: 'command',
            args: ['settings', 'view'],
        })
    })

    it('returns null for unsupported URLs', () => {
        expect(routeViewUrl('https://app.todoist.com/app/team/inbox')).toBeNull()
        expect(routeViewUrl('https://google.com')).toBeNull()
        expect(routeViewUrl('not a url')).toBeNull()
    })
})

describe('view command', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetApi.mockResolvedValue({
            getLabel: vi.fn().mockResolvedValue({ id: '2183057949', name: 'this-week' }),
        } as never)
    })

    it('dispatches task URL to task view', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/task/buy-milk-abc123',
        ])

        expect(spies.taskView).toHaveBeenCalledWith('id:abc123')
    })

    it('dispatches project URL to project view', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/project/work-proj1',
        ])

        expect(spies.projectView).toHaveBeenCalledWith('id:proj1')
    })

    it('dispatches today URL', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'view', 'https://app.todoist.com/app/today'])

        expect(spies.today).toHaveBeenCalledTimes(1)
    })

    it('dispatches upcoming URL', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'view', 'https://app.todoist.com/app/upcoming'])

        expect(spies.upcoming).toHaveBeenCalledTimes(1)
    })

    it('dispatches inbox URL', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'view', 'https://app.todoist.com/app/inbox'])

        expect(spies.inbox).toHaveBeenCalledTimes(1)
    })

    it('dispatches settings URL to settings view', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'view', 'https://app.todoist.com/app/settings'])

        expect(spies.settingsView).toHaveBeenCalledTimes(1)
    })

    it('dispatches filter URL to filter show', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/filter/unscheduled-2353370974',
        ])

        expect(spies.filterShow).toHaveBeenCalledWith('id:2353370974')
    })

    it('dispatches workspace filter URL to filter show', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/69/filter/q4-frontend-31',
        ])

        expect(spies.filterShow).toHaveBeenCalledWith('id:31')
    })

    it('dispatches label URL to task list --label <name>', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/label/this-week-2183057949',
        ])

        expect(mockGetApi).toHaveBeenCalledTimes(1)
        expect(spies.taskList).toHaveBeenCalledWith('this-week')
    })

    it('throws helpful error for unsupported URL', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'view', 'https://app.todoist.com/app/team/inbox']),
        ).rejects.toThrow('UNSUPPORTED_URL')
    })
})

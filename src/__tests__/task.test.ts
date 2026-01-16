import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    completeTaskForever: vi.fn(),
}))

vi.mock('../lib/browser.js', () => ({
    openInBrowser: vi.fn(),
}))

import { registerTaskCommand } from '../commands/task.js'
import { completeTaskForever, getApi } from '../lib/api/core.js'
import { openInBrowser } from '../lib/browser.js'

const mockGetApi = vi.mocked(getApi)
const mockCompleteTaskForever = vi.mocked(completeTaskForever)
const mockOpenInBrowser = vi.mocked(openInBrowser)

function createMockApi() {
    return {
        getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getTask: vi.fn(),
        getSections: vi.fn().mockResolvedValue({ results: [] }),
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProject: vi.fn(),
        addTask: vi.fn(),
        updateTask: vi.fn(),
        closeTask: vi.fn(),
        reopenTask: vi.fn(),
        deleteTask: vi.fn(),
        moveTask: vi.fn(),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerTaskCommand(program)
    return program
}

describe('task move command', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('throws error when no destination flags provided', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Test task', projectId: 'proj-1' }],
        })

        await expect(
            program.parseAsync(['node', 'td', 'task', 'move', 'Test task']),
        ).rejects.toThrow(
            'At least one of --project, --section, --parent, --no-parent, or --no-section is required.',
        )
    })

    it('moves task to project', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Test task', projectId: 'proj-1' }],
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-2', name: 'Target Project' }],
        })
        mockApi.moveTask.mockResolvedValue({})

        await program.parseAsync([
            'node',
            'td',
            'task',
            'move',
            'Test task',
            '--project',
            'Target Project',
        ])

        expect(mockApi.moveTask).toHaveBeenCalledWith('task-1', {
            projectId: 'proj-2',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Moved: Test task')
        consoleSpy.mockRestore()
    })

    it('moves task to section in current project', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Test task', projectId: 'proj-1' }],
        })
        mockApi.getSections.mockResolvedValue({
            results: [{ id: 'sec-1', name: 'Planning' }],
        })
        mockApi.moveTask.mockResolvedValue({})

        await program.parseAsync([
            'node',
            'td',
            'task',
            'move',
            'Test task',
            '--section',
            'Planning',
        ])

        expect(mockApi.getSections).toHaveBeenCalledWith({ projectId: 'proj-1' })
        expect(mockApi.moveTask).toHaveBeenCalledWith('task-1', {
            sectionId: 'sec-1',
        })
        consoleSpy.mockRestore()
    })

    it('moves task to section in specified project', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Test task', projectId: 'proj-1' }],
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-2', name: 'Target Project' }],
        })
        mockApi.getSections.mockResolvedValue({
            results: [{ id: 'sec-2', name: 'Review' }],
        })
        mockApi.moveTask.mockResolvedValue({})

        await program.parseAsync([
            'node',
            'td',
            'task',
            'move',
            'Test task',
            '--project',
            'Target Project',
            '--section',
            'Review',
        ])

        expect(mockApi.getSections).toHaveBeenCalledWith({ projectId: 'proj-2' })
        expect(mockApi.moveTask).toHaveBeenCalledWith('task-1', {
            sectionId: 'sec-2',
        })
        consoleSpy.mockRestore()
    })

    it('moves task to parent', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks
            .mockResolvedValueOnce({
                results: [
                    {
                        id: 'task-1',
                        content: 'Child task',
                        projectId: 'proj-1',
                        sectionId: null,
                    },
                    { id: 'task-2', content: 'Parent task', projectId: 'proj-1' },
                ],
            })
            .mockResolvedValueOnce({
                results: [
                    { id: 'task-1', content: 'Child task', projectId: 'proj-1' },
                    { id: 'task-2', content: 'Parent task', projectId: 'proj-1' },
                ],
            })
        mockApi.moveTask.mockResolvedValue({})

        await program.parseAsync([
            'node',
            'td',
            'task',
            'move',
            'Child task',
            '--parent',
            'Parent task',
        ])

        expect(mockApi.moveTask).toHaveBeenCalledWith('task-1', {
            parentId: 'task-2',
        })
        consoleSpy.mockRestore()
    })

    it('moves task to project root with --no-parent', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Child task',
                    projectId: 'proj-1',
                    parentId: 'parent-1',
                },
            ],
        })
        mockApi.moveTask.mockResolvedValue({})

        await program.parseAsync(['node', 'td', 'task', 'move', 'Child task', '--no-parent'])

        expect(mockApi.moveTask).toHaveBeenCalledWith('task-1', {
            projectId: 'proj-1',
        })
        consoleSpy.mockRestore()
    })

    it('moves task to project root with --no-section', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task in section',
                    projectId: 'proj-1',
                    sectionId: 'section-1',
                },
            ],
        })
        mockApi.moveTask.mockResolvedValue({})

        await program.parseAsync(['node', 'td', 'task', 'move', 'Task in section', '--no-section'])

        expect(mockApi.moveTask).toHaveBeenCalledWith('task-1', {
            projectId: 'proj-1',
        })
        consoleSpy.mockRestore()
    })

    it('moves task using id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test task',
            projectId: 'proj-1',
        })
        mockApi.getProject.mockResolvedValue({ id: 'proj-2', name: 'Target' })
        mockApi.moveTask.mockResolvedValue({})

        await program.parseAsync([
            'node',
            'td',
            'task',
            'move',
            'id:task-1',
            '--project',
            'id:proj-2',
        ])

        expect(mockApi.getTask).toHaveBeenCalledWith('task-1')
        expect(mockApi.getProject).toHaveBeenCalledWith('proj-2')
        expect(mockApi.moveTask).toHaveBeenCalledWith('task-1', {
            projectId: 'proj-2',
        })
        consoleSpy.mockRestore()
    })
})

describe('task view', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('resolves task by name and shows details', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Buy milk',
                    priority: 4,
                    projectId: 'proj-1',
                    labels: [],
                    due: null,
                },
            ],
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Inbox' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'view', 'Buy milk'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Buy milk'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ID:'))
        consoleSpy.mockRestore()
    })

    it('resolves task by id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            priority: 1,
            projectId: 'proj-1',
            labels: [],
            due: null,
        })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'task', 'view', 'id:task-1'])

        expect(mockApi.getTask).toHaveBeenCalledWith('task-1')
        consoleSpy.mockRestore()
    })

    it('shows full metadata with --full flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            priority: 1,
            projectId: 'proj-1',
            labels: [],
            due: null,
            url: 'https://todoist.com/task/1',
            addedAt: '2026-01-01T00:00:00Z',
        })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'task', 'view', 'id:task-1', '--full'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Metadata'))
        consoleSpy.mockRestore()
    })
})

describe('task complete', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('marks task as complete', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            checked: false,
        })
        mockApi.closeTask.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'task', 'complete', 'id:task-1'])

        expect(mockApi.closeTask).toHaveBeenCalledWith('task-1')
        expect(consoleSpy).toHaveBeenCalledWith('Completed: Buy milk')
        consoleSpy.mockRestore()
    })

    it('shows message for already completed task', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Done task',
            checked: true,
        })

        await program.parseAsync(['node', 'td', 'task', 'complete', 'id:task-1'])

        expect(mockApi.closeTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Task already completed.')
        consoleSpy.mockRestore()
    })

    it('resolves task by name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Buy milk', checked: false }],
        })
        mockApi.closeTask.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'task', 'complete', 'Buy milk'])

        expect(mockApi.closeTask).toHaveBeenCalledWith('task-1')
        consoleSpy.mockRestore()
    })

    it('blocks completion for uncompletable tasks', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: '* Reference item',
            checked: false,
            isUncompletable: true,
        })

        await program.parseAsync(['node', 'td', 'task', 'complete', 'id:task-1'])

        expect(mockApi.closeTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Task is uncompletable (reference item).')
        consoleSpy.mockRestore()
    })

    it('completes recurring task forever with --forever flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Recurring task',
            checked: false,
            due: { isRecurring: true, date: '2026-01-12', string: 'every day' },
        })
        mockCompleteTaskForever.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'task', 'complete', 'id:task-1', '--forever'])

        expect(mockCompleteTaskForever).toHaveBeenCalledWith('task-1')
        expect(mockApi.closeTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Completed forever: Recurring task')
        consoleSpy.mockRestore()
    })

    it('warns when --forever used on non-recurring task', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Normal task',
            checked: false,
        })
        mockCompleteTaskForever.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'task', 'complete', 'id:task-1', '--forever'])

        expect(mockCompleteTaskForever).toHaveBeenCalledWith('task-1')
        expect(mockApi.closeTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Task is not recurring, completing normally.')
        expect(consoleSpy).toHaveBeenCalledWith('Completed forever: Normal task')
        consoleSpy.mockRestore()
    })
})

describe('task uncomplete', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('reopens task with id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.reopenTask.mockResolvedValue(true)

        await program.parseAsync(['node', 'td', 'task', 'uncomplete', 'id:task-1'])

        expect(mockApi.reopenTask).toHaveBeenCalledWith('task-1')
        expect(consoleSpy).toHaveBeenCalledWith('Reopened task task-1')
        consoleSpy.mockRestore()
    })

    it('requires id: prefix', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'task', 'uncomplete', 'some-task-name']),
        ).rejects.toThrow('INVALID_REF')
    })
})

describe('task delete', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test task' })

        await program.parseAsync(['node', 'td', 'task', 'delete', 'id:task-1'])

        expect(mockApi.deleteTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete: Test task')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('deletes task with --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test task' })
        mockApi.deleteTask.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'task', 'delete', 'id:task-1', '--yes'])

        expect(mockApi.deleteTask).toHaveBeenCalledWith('task-1')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: Test task')
        consoleSpy.mockRestore()
    })
})

describe('task add', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('creates task with content', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'New task',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'add', '--content', 'New task'])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'New task' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Created: New task')
        consoleSpy.mockRestore()
    })

    it('creates task with --due', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: { date: '2026-01-10', string: 'tomorrow' },
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--due',
            'tomorrow',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ dueString: 'tomorrow' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Due: tomorrow')
        consoleSpy.mockRestore()
    })

    it('creates task with --priority', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--priority',
            'p1',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(expect.objectContaining({ priority: 4 }))
        consoleSpy.mockRestore()
    })

    it('creates task with --project (resolves name)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--project',
            'Work',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
        consoleSpy.mockRestore()
    })

    it('requires id: prefix for --section', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'task',
                'add',
                '--content',
                'Task',
                '--section',
                'Planning',
            ]),
        ).rejects.toThrow('INVALID_REF')
    })

    it('creates task with --section using id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--section',
            'id:sec-1',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ sectionId: 'sec-1' }),
        )
        consoleSpy.mockRestore()
    })

    it('creates task with --labels', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--labels',
            'urgent,home',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ labels: ['urgent', 'home'] }),
        )
        consoleSpy.mockRestore()
    })

    it('creates task with --description', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--description',
            'Some notes',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Some notes' }),
        )
        consoleSpy.mockRestore()
    })

    it('shows task ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-xyz',
            content: 'Task',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'add', '--content', 'Task'])

        expect(consoleSpy).toHaveBeenCalledWith('ID: task-xyz')
        consoleSpy.mockRestore()
    })

    it('adds task with duration', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-1',
            content: 'Meeting',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Meeting',
            '--duration',
            '1h30m',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'Meeting',
                duration: 90,
                durationUnit: 'minute',
            }),
        )
        consoleSpy.mockRestore()
    })

    it('throws error for invalid duration format', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'task',
                'add',
                '--content',
                'Task',
                '--duration',
                'invalid',
            ]),
        ).rejects.toThrow('Invalid duration format')
    })

    it('creates subtask with id:xxx parent format', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'child-1',
            content: 'Child task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Child task',
            '--parent',
            'id:parent-1',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'Child task', parentId: 'parent-1' }),
        )
        consoleSpy.mockRestore()
    })

    it('creates subtask with fuzzy parent name match', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'parent-1', content: 'Parent task', projectId: 'proj-1' }],
            nextCursor: null,
        })
        mockApi.addTask.mockResolvedValue({
            id: 'child-1',
            content: 'Child task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Child task',
            '--parent',
            'Parent task',
            '--project',
            'Work',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'Child task', parentId: 'parent-1' }),
        )
        consoleSpy.mockRestore()
    })

    it('throws error when using fuzzy parent without project', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'task',
                'add',
                '--content',
                'Child task',
                '--parent',
                'Parent task',
            ]),
        ).rejects.toThrow('The --project flag is required when using --parent with a task name.')
    })
})

describe('task update', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('updates task content', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Old content' })
        mockApi.updateTask.mockResolvedValue({
            id: 'task-1',
            content: 'New content',
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'update',
            'id:task-1',
            '--content',
            'New content',
        ])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            content: 'New content',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated: New content')
        consoleSpy.mockRestore()
    })

    it('updates task due date', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Task' })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'update',
            'id:task-1',
            '--due',
            'next week',
        ])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            dueString: 'next week',
        })
        consoleSpy.mockRestore()
    })

    it('updates task priority', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Task' })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync(['node', 'td', 'task', 'update', 'id:task-1', '--priority', 'p2'])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', { priority: 3 })
        consoleSpy.mockRestore()
    })

    it('updates task labels (replaces existing)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Task' })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'update',
            'id:task-1',
            '--labels',
            'work,urgent',
        ])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            labels: ['work', 'urgent'],
        })
        consoleSpy.mockRestore()
    })

    it('resolves task by name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Buy milk' }],
        })
        mockApi.updateTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy oat milk',
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'update',
            'Buy milk',
            '--content',
            'Buy oat milk',
        ])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            content: 'Buy oat milk',
        })
        consoleSpy.mockRestore()
    })

    it('updates task duration', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Task' })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync(['node', 'td', 'task', 'update', 'id:task-1', '--duration', '2h'])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            duration: 120,
            durationUnit: 'minute',
        })
        consoleSpy.mockRestore()
    })
})

describe('task list --label', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('filters tasks by label', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Work task',
                    labels: ['work'],
                    projectId: 'proj-1',
                },
                {
                    id: 'task-2',
                    content: 'Home task',
                    labels: ['home'],
                    projectId: 'proj-1',
                },
                {
                    id: 'task-3',
                    content: 'Both',
                    labels: ['work', 'urgent'],
                    projectId: 'proj-1',
                },
            ],
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Inbox' }],
        })

        await program.parseAsync(['node', 'td', 'task', 'list', '--label', 'work'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work task'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Both'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Home task'))
        consoleSpy.mockRestore()
    })

    it('filters tasks by multiple labels (OR)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Work task',
                    labels: ['work'],
                    projectId: 'proj-1',
                },
                {
                    id: 'task-2',
                    content: 'Home task',
                    labels: ['home'],
                    projectId: 'proj-1',
                },
                {
                    id: 'task-3',
                    content: 'Urgent task',
                    labels: ['urgent'],
                    projectId: 'proj-1',
                },
            ],
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Inbox' }],
        })

        await program.parseAsync(['node', 'td', 'task', 'list', '--label', 'work,urgent'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work task'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Urgent task'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Home task'))
        consoleSpy.mockRestore()
    })

    it('label filter is case-insensitive', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Work task',
                    labels: ['Work'],
                    projectId: 'proj-1',
                },
            ],
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Inbox' }],
        })

        await program.parseAsync(['node', 'td', 'task', 'list', '--label', 'WORK'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work task'))
        consoleSpy.mockRestore()
    })
})

describe('task list --parent', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('filters subtasks by parent id', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'parent-1',
            content: 'Parent task',
            projectId: 'proj-1',
        })
        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'parent-1',
                    content: 'Parent task',
                    parentId: null,
                    projectId: 'proj-1',
                    labels: [],
                },
                {
                    id: 'child-1',
                    content: 'Child 1',
                    parentId: 'parent-1',
                    projectId: 'proj-1',
                    labels: [],
                },
                {
                    id: 'child-2',
                    content: 'Child 2',
                    parentId: 'parent-1',
                    projectId: 'proj-1',
                    labels: [],
                },
                {
                    id: 'other',
                    content: 'Other task',
                    parentId: null,
                    projectId: 'proj-1',
                    labels: [],
                },
            ],
        })
        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Test Project',
        })
        mockApi.getSections.mockResolvedValue({ results: [] })

        await program.parseAsync(['node', 'td', 'task', 'list', '--parent', 'id:parent-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Child 1'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Child 2'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Parent task'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Other task'))
        consoleSpy.mockRestore()
    })

    it('resolves parent by name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks
            .mockResolvedValueOnce({
                results: [{ id: 'parent-1', content: 'Parent task', projectId: 'proj-1' }],
            })
            .mockResolvedValueOnce({
                results: [
                    {
                        id: 'parent-1',
                        content: 'Parent task',
                        parentId: null,
                        projectId: 'proj-1',
                        labels: [],
                    },
                    {
                        id: 'child-1',
                        content: 'Child task',
                        parentId: 'parent-1',
                        projectId: 'proj-1',
                        labels: [],
                    },
                ],
            })
        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Test Project',
        })
        mockApi.getSections.mockResolvedValue({ results: [] })

        await program.parseAsync(['node', 'td', 'task', 'list', '--parent', 'Parent task'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Child task'))
        consoleSpy.mockRestore()
    })

    it('shows no tasks message when parent has no children', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'parent-1',
            content: 'Parent task',
            projectId: 'proj-1',
        })
        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'parent-1',
                    content: 'Parent task',
                    parentId: null,
                    projectId: 'proj-1',
                    labels: [],
                },
            ],
        })
        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Test Project',
        })
        mockApi.getSections.mockResolvedValue({ results: [] })

        await program.parseAsync(['node', 'td', 'task', 'list', '--parent', 'id:parent-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No tasks found'))
        consoleSpy.mockRestore()
    })
})

describe('task add --assignee', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('creates task with assignee using id:', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work', isShared: true }],
        })
        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--project',
            'Work',
            '--assignee',
            'id:user-123',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ assigneeId: 'user-123' }),
        )
        consoleSpy.mockRestore()
    })

    it('throws error when --assignee used without --project', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'task',
                'add',
                '--content',
                'Task',
                '--assignee',
                'id:user-123',
            ]),
        ).rejects.toThrow('PROJECT_REQUIRED')
    })
})

describe('task update --assignee', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('updates task with assignee using id:', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Task',
            projectId: 'proj-1',
        })
        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            isShared: true,
        })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'update',
            'id:task-1',
            '--assignee',
            'id:user-123',
        ])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            assigneeId: 'user-123',
        })
        consoleSpy.mockRestore()
    })

    it('unassigns task with --unassign flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Task',
            projectId: 'proj-1',
        })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync(['node', 'td', 'task', 'update', 'id:task-1', '--unassign'])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            assigneeId: null,
        })
        consoleSpy.mockRestore()
    })
})

describe('task add --deadline', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('creates task with deadline', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: null,
            deadline: { date: '2026-06-15', lang: 'en' },
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--deadline',
            '2026-06-15',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({ deadlineDate: '2026-06-15' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Deadline: 2026-06-15')
        consoleSpy.mockRestore()
    })

    it('creates task with both due and deadline', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addTask.mockResolvedValue({
            id: 'task-new',
            content: 'Task',
            due: { date: '2026-06-10', string: 'Jun 10' },
            deadline: { date: '2026-06-15', lang: 'en' },
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'add',
            '--content',
            'Task',
            '--due',
            'Jun 10',
            '--deadline',
            '2026-06-15',
        ])

        expect(mockApi.addTask).toHaveBeenCalledWith(
            expect.objectContaining({
                dueString: 'Jun 10',
                deadlineDate: '2026-06-15',
            }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Due: Jun 10')
        expect(consoleSpy).toHaveBeenCalledWith('Deadline: 2026-06-15')
        consoleSpy.mockRestore()
    })
})

describe('task update --deadline', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('updates task with deadline', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Task' })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'update',
            'id:task-1',
            '--deadline',
            '2026-12-31',
        ])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            deadlineDate: '2026-12-31',
        })
        consoleSpy.mockRestore()
    })

    it('removes deadline with --no-deadline', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Task',
            deadline: { date: '2026-12-31', lang: 'en' },
        })
        mockApi.updateTask.mockResolvedValue({ id: 'task-1', content: 'Task' })

        await program.parseAsync(['node', 'td', 'task', 'update', 'id:task-1', '--no-deadline'])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            deadlineDate: null,
        })
        consoleSpy.mockRestore()
    })
})

describe('task list --filter', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('uses getTasksByFilter when --filter is provided', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Overdue task',
                    projectId: 'proj-1',
                    priority: 4,
                    labels: [],
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Project' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'list', '--filter', 'today | overdue'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'today | overdue' }),
        )
        expect(mockApi.getTasks).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overdue task'))
        consoleSpy.mockRestore()
    })

    it('does not use getTasksByFilter when --filter is not provided', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Regular task',
                    projectId: 'proj-1',
                    priority: 1,
                    labels: [],
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Project' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'list'])

        expect(mockApi.getTasks).toHaveBeenCalled()
        expect(mockApi.getTasksByFilter).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --filter and --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Filtered task',
                    projectId: 'proj-1',
                    priority: 1,
                    labels: [],
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'list', '--filter', '@work', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Filtered task')
        consoleSpy.mockRestore()
    })

    it('can combine --filter with other local filters like --priority', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'High priority',
                    projectId: 'proj-1',
                    priority: 4,
                    labels: [],
                },
                {
                    id: 'task-2',
                    content: 'Low priority',
                    projectId: 'proj-1',
                    priority: 1,
                    labels: [],
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Project' }],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'task',
            'list',
            '--filter',
            '@work',
            '--priority',
            'p1',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('High priority'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Low priority'))
        consoleSpy.mockRestore()
    })
})

describe('task browse', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('opens task in browser by name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Buy milk', projectId: 'proj-1' }],
        })

        await program.parseAsync(['node', 'td', 'task', 'browse', 'Buy milk'])

        expect(mockOpenInBrowser).toHaveBeenCalledWith('https://app.todoist.com/app/task/task-1')
        consoleSpy.mockRestore()
    })

    it('opens task in browser by id:', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-123',
            content: 'Test task',
            projectId: 'proj-1',
        })

        await program.parseAsync(['node', 'td', 'task', 'browse', 'id:task-123'])

        expect(mockOpenInBrowser).toHaveBeenCalledWith('https://app.todoist.com/app/task/task-123')
        consoleSpy.mockRestore()
    })
})

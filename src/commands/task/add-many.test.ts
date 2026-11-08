import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    captureConsole,
    captureStream,
    createTestProgram,
    mockStdin,
} from '@doist/cli-core/testing'
import type { SyncError } from '@doist/todoist-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk')

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
    completeTaskForever: vi.fn(),
    rescheduleTask: vi.fn(),
}))

import { CliError, SyncCommandError } from '../../lib/errors.js'
import { resetGlobalArgs } from '../../lib/global-args.js'
import { SKILL_CONTENT } from '../../lib/skills/content.js'
import { setupApiMock } from '../../test-support/api-mock.js'
import { fixtures } from '../../test-support/fixtures.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { registerTaskCommand } from './index.js'

type SentCommand = {
    type: string
    uuid: string
    tempId?: string
    args: Record<string, unknown>
}

/**
 * Stands in for the Sync API. Every created resource gets the next ID
 * (`task-new-1`, `sec-new-2`, …), and every command succeeds unless `fail`
 * names an error for it, or it refers to a temp ID whose command failed in the
 * same request. Failures come back the way `getApi()` surfaces them.
 * Returns the commands of each request, in order.
 */
function fakeSync(
    mockApi: MockApi,
    options: { fail?: (command: SentCommand) => string | undefined } = {},
): SentCommand[][] {
    const requests: SentCommand[][] = []
    let nextId = 1
    mockApi.sync.mockImplementation(async ({ commands }: { commands: SentCommand[] }) => {
        requests.push(commands)
        const syncStatus: Record<string, 'ok' | SyncError> = {}
        const tempIdMapping: Record<string, string> = {}
        const failedTempIds = new Set<string>()
        let firstFailure: SyncError | undefined
        for (const command of commands) {
            const refersToFailed = Object.values(command.args).some(
                (value) => typeof value === 'string' && failedTempIds.has(value),
            )
            const error = refersToFailed ? 'Invalid temporary id' : options.fail?.(command)
            if (error) {
                const failure: SyncError = {
                    error,
                    errorCode: 20,
                    errorExtra: {},
                    errorTag: 'INVALID_ARGUMENT_VALUE',
                    httpCode: 400,
                }
                syncStatus[command.uuid] = failure
                firstFailure ??= failure
                if (command.tempId) failedTempIds.add(command.tempId)
                continue
            }
            syncStatus[command.uuid] = 'ok'
            if (command.tempId) {
                const prefix = command.type === 'section_add' ? 'sec-new' : 'task-new'
                tempIdMapping[command.tempId] = `${prefix}-${nextId++}`
            }
        }
        if (firstFailure) {
            throw new SyncCommandError(
                new CliError('API_ERROR', firstFailure.error),
                syncStatus,
                tempIdMapping,
            )
        }
        return { syncStatus, tempIdMapping }
    })
    return requests
}

function typesAndArgs(commands: SentCommand[]) {
    return commands.map(({ type, args }) => ({ type, args }))
}

function createProgram() {
    return createTestProgram(registerTaskCommand)
}

describe('task add-many', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        resetGlobalArgs()
        mockApi = setupApiMock()
        mockApi.getProjects.mockResolvedValue({
            results: [fixtures.projects.inbox, fixtures.projects.work],
            nextCursor: null,
        })
    })

    describe('input', () => {
        let tmpDir: string

        beforeEach(async () => {
            tmpDir = await mkdtemp(join(tmpdir(), 'td-add-many-test-'))
        })

        afterEach(async () => {
            await rm(tmpDir, { recursive: true, force: true })
        })

        it('creates every task from stdin in one Sync request, in input order', async () => {
            const consoleSpy = captureConsole()
            const requests = fakeSync(mockApi)
            mockStdin(JSON.stringify([{ content: 'Draft brief' }, { content: 'Book venue' }]))

            await createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
            ])

            expect(requests).toHaveLength(1)
            expect(typesAndArgs(requests[0])).toEqual([
                { type: 'item_add', args: { content: 'Draft brief', projectId: 'proj-work' } },
                { type: 'item_add', args: { content: 'Book venue', projectId: 'proj-work' } },
            ])
            expect(consoleSpy).toHaveBeenCalledWith('Created 2 tasks in Work')
        })

        it('reads the task list from --file', async () => {
            captureConsole()
            const requests = fakeSync(mockApi)
            const file = join(tmpDir, 'tasks.json')
            await writeFile(file, JSON.stringify([{ content: 'Draft brief' }]))

            await createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--file',
                file,
            ])

            expect(typesAndArgs(requests[0])).toEqual([
                { type: 'item_add', args: { content: 'Draft brief', projectId: 'proj-work' } },
            ])
        })

        it('reports a missing --file without calling the API', async () => {
            const file = join(tmpDir, 'missing.json')

            await expect(
                createProgram().parseAsync(['node', 'td', 'task', 'add-many', '--file', file]),
            ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
            expect(mockApi.sync).not.toHaveBeenCalled()
        })

        it('adds to the Inbox when no --project is given', async () => {
            const consoleSpy = captureConsole()
            const requests = fakeSync(mockApi)
            mockStdin(JSON.stringify([{ content: 'Call the bank' }]))

            await createProgram().parseAsync(['node', 'td', 'task', 'add-many', '--stdin'])

            expect(typesAndArgs(requests[0])).toEqual([
                { type: 'item_add', args: { content: 'Call the bank' } },
            ])
            expect(consoleSpy).toHaveBeenCalledWith('Created 1 task')
        })

        it('rejects --stdin together with --file', async () => {
            await expect(
                createProgram().parseAsync([
                    'node',
                    'td',
                    'task',
                    'add-many',
                    '--stdin',
                    '--file',
                    'tasks.json',
                ]),
            ).rejects.toMatchObject({ code: 'CONFLICTING_OPTIONS' })
            expect(mockApi.sync).not.toHaveBeenCalled()
        })

        it('shows usage when neither --stdin nor --file is given', async () => {
            const stderrSpy = captureStream('stderr')

            await expect(
                createProgram().parseAsync(['node', 'td', 'task', 'add-many']),
            ).rejects.toMatchObject({ code: 'commander.help', exitCode: 1 })

            const output = stderrSpy.mock.calls.map((c) => c[0]).join('')
            expect(output).toContain('Usage: td task add-many')
            expect(mockApi.sync).not.toHaveBeenCalled()
        })
    })

    describe('subtasks', () => {
        it('links each subtask to its parent through the parent temp ID, depth first', async () => {
            const consoleSpy = captureConsole()
            const requests = fakeSync(mockApi)
            mockStdin(
                JSON.stringify([
                    {
                        content: 'Plan launch',
                        subtasks: [
                            { content: 'Draft brief', subtasks: [{ content: 'Collect quotes' }] },
                            { content: 'Book venue' },
                        ],
                    },
                    { content: 'Send invites' },
                ]),
            )

            await createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
            ])

            const [plan, draft, collect, book, invites] = requests[0]
            expect(typesAndArgs(requests[0])).toEqual([
                { type: 'item_add', args: { content: 'Plan launch', projectId: 'proj-work' } },
                { type: 'item_add', args: { content: 'Draft brief', parentId: plan.tempId } },
                { type: 'item_add', args: { content: 'Collect quotes', parentId: draft.tempId } },
                { type: 'item_add', args: { content: 'Book venue', parentId: plan.tempId } },
                { type: 'item_add', args: { content: 'Send invites', projectId: 'proj-work' } },
            ])
            expect(new Set([plan, draft, collect, book, invites].map((c) => c.tempId)).size).toBe(5)
            expect(consoleSpy).toHaveBeenCalledWith('Created 5 tasks in Work')
        })
    })

    describe('sections', () => {
        beforeEach(() => {
            mockApi.getSections.mockResolvedValue({
                results: [fixtures.sections.planning, fixtures.sections.inProgress],
                nextCursor: null,
            })
        })

        async function addMany(tasks: unknown[]) {
            mockStdin(JSON.stringify(tasks))
            await createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
            ])
        }

        it('reuses an existing section whose name matches, ignoring case', async () => {
            captureConsole()
            const requests = fakeSync(mockApi)

            await addMany([{ content: 'Draft brief', section: 'planning' }])

            expect(mockApi.getSections).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: 'proj-work' }),
            )
            expect(typesAndArgs(requests[0])).toEqual([
                {
                    type: 'item_add',
                    args: { content: 'Draft brief', projectId: 'proj-work', sectionId: 'sec-1' },
                },
            ])
        })

        it('creates a missing section once, before the tasks that use it', async () => {
            const consoleSpy = captureConsole()
            const requests = fakeSync(mockApi)

            await addMany([
                { content: 'Book venue', section: 'Launch' },
                { content: 'Draft brief', section: 'Planning' },
                { content: 'Send invites', section: 'launch' },
            ])

            const [launch] = requests[0]
            expect(typesAndArgs(requests[0])).toEqual([
                { type: 'section_add', args: { projectId: 'proj-work', name: 'Launch' } },
                {
                    type: 'item_add',
                    args: {
                        content: 'Book venue',
                        projectId: 'proj-work',
                        sectionId: launch.tempId,
                    },
                },
                {
                    type: 'item_add',
                    args: { content: 'Draft brief', projectId: 'proj-work', sectionId: 'sec-1' },
                },
                {
                    type: 'item_add',
                    args: {
                        content: 'Send invites',
                        projectId: 'proj-work',
                        sectionId: launch.tempId,
                    },
                },
            ])
            expect(consoleSpy).toHaveBeenCalledWith('Created 3 tasks and 1 section in Work')
        })

        it('uses an id: section reference as given', async () => {
            captureConsole()
            const requests = fakeSync(mockApi)

            await addMany([{ content: 'Draft brief', section: 'id:sec-9' }])

            expect(typesAndArgs(requests[0])).toEqual([
                {
                    type: 'item_add',
                    args: { content: 'Draft brief', projectId: 'proj-work', sectionId: 'sec-9' },
                },
            ])
        })

        it('does not look up sections when no task names one', async () => {
            captureConsole()
            fakeSync(mockApi)

            await addMany([{ content: 'Draft brief' }])

            expect(mockApi.getSections).not.toHaveBeenCalled()
        })

        it('requires --project when a task names a section', async () => {
            mockStdin(JSON.stringify([{ content: 'Draft brief', section: 'Planning' }]))

            await expect(
                createProgram().parseAsync(['node', 'td', 'task', 'add-many', '--stdin']),
            ).rejects.toMatchObject({ code: 'PROJECT_REQUIRED' })
            expect(mockApi.sync).not.toHaveBeenCalled()
        })
    })

    describe('task fields', () => {
        async function addMany(tasks: unknown[]) {
            mockStdin(JSON.stringify(tasks))
            await createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
            ])
        }

        it('maps each field the way td task add does', async () => {
            captureConsole()
            const requests = fakeSync(mockApi)

            await addMany([
                {
                    content: 'Draft brief',
                    description: 'Two pages',
                    due: 'every friday',
                    deadline: '2026-12-01',
                    priority: 'P1',
                    labels: ['writing', '@urgent'],
                    duration: '1h30m',
                    assignee: 'id:user-2',
                },
            ])

            expect(typesAndArgs(requests[0])).toEqual([
                {
                    type: 'item_add',
                    args: {
                        content: 'Draft brief',
                        projectId: 'proj-work',
                        description: 'Two pages',
                        due: { string: 'every friday' },
                        deadline: { date: '2026-12-01' },
                        priority: 4,
                        labels: ['writing', 'urgent'],
                        duration: { amount: 90, unit: 'minute' },
                        responsibleUid: 'user-2',
                    },
                },
            ])
        })

        it('sets fields on subtasks too', async () => {
            captureConsole()
            const requests = fakeSync(mockApi)

            await addMany([
                { content: 'Plan launch', subtasks: [{ content: 'Draft brief', priority: 'p2' }] },
            ])

            expect(requests[0][1].args).toEqual({
                content: 'Draft brief',
                parentId: requests[0][0].tempId,
                priority: 3,
            })
        })

        it('looks up an assignee by name once for every task that names them', async () => {
            captureConsole()
            const requests = fakeSync(mockApi)
            mockApi.getProjects.mockResolvedValue({
                results: [{ ...fixtures.projects.work, isShared: true }],
                nextCursor: null,
            })
            mockApi.getProjectCollaborators.mockResolvedValue({
                results: [{ id: 'user-2', name: 'Alice Example', email: 'alice@example.com' }],
                nextCursor: null,
            })

            await addMany([
                { content: 'Draft brief', assignee: 'Alice Example' },
                { content: 'Book venue', assignee: 'alice example' },
            ])

            expect(requests[0].map((command) => command.args.responsibleUid)).toEqual([
                'user-2',
                'user-2',
            ])
            expect(mockApi.getProjectCollaborators).toHaveBeenCalledTimes(1)
        })

        it('leaves out a label list that is empty after removing @', async () => {
            captureConsole()
            const requests = fakeSync(mockApi)

            await addMany([{ content: 'Draft brief', labels: ['@'] }])

            expect(requests[0][0].args).toEqual({ content: 'Draft brief', projectId: 'proj-work' })
        })

        it('requires --project when a task names an assignee', async () => {
            mockStdin(JSON.stringify([{ content: 'Draft brief', assignee: 'id:user-2' }]))

            await expect(
                createProgram().parseAsync(['node', 'td', 'task', 'add-many', '--stdin']),
            ).rejects.toMatchObject({ code: 'PROJECT_REQUIRED' })
            expect(mockApi.sync).not.toHaveBeenCalled()
        })
    })

    describe('input validation', () => {
        it.each([
            [
                'text that is not JSON',
                'Draft brief',
                'INVALID_JSON',
                expect.stringMatching(/^Input is not valid JSON: /),
            ],
            [
                'empty input',
                '  \n',
                'INVALID_JSON',
                'Input is empty; expected a JSON array of tasks.',
            ],
            [
                'an object instead of a list',
                '{"content": "Draft brief"}',
                'INVALID_INPUT',
                'Invalid task list: Invalid input: expected array, received object',
            ],
            [
                'an empty list',
                '[]',
                'INVALID_INPUT',
                'Invalid task list: expected at least one task',
            ],
            [
                'a task without content',
                '[{"due": "friday"}]',
                'INVALID_INPUT',
                'Invalid task list: [0].content: Invalid input: expected string, received undefined',
            ],
            [
                'blank content',
                '[{"content": "  "}]',
                'INVALID_INPUT',
                'Invalid task list: [0].content: must not be empty',
            ],
            [
                'a misspelt key',
                '[{"content": "Draft brief", "priorty": "p1"}]',
                'INVALID_INPUT',
                'Invalid task list: [0]: unrecognised key "priorty"',
            ],
            [
                'an unknown priority',
                '[{"content": "Draft brief", "priority": "p5"}]',
                'INVALID_INPUT',
                'Invalid task list: [0].priority: expected p1, p2, p3 or p4',
            ],
            [
                'a deadline that is not a date',
                '[{"content": "Draft brief", "deadline": "next week"}]',
                'INVALID_INPUT',
                'Invalid task list: [0].deadline: expected a date as YYYY-MM-DD',
            ],
            [
                'an unreadable duration',
                '[{"content": "Draft brief", "duration": "a while"}]',
                'INVALID_INPUT',
                'Invalid task list: [0].duration: expected a duration such as 30m, 1h or 2h15m',
            ],
            [
                'labels as a single string',
                '[{"content": "Draft brief", "labels": "writing,urgent"}]',
                'INVALID_INPUT',
                'Invalid task list: [0].labels: Invalid input: expected array, received string',
            ],
            [
                'a problem in a nested subtask',
                '[{"content": "Plan", "subtasks": [{"content": "Draft", "subtasks": [{"content": ""}]}]}]',
                'INVALID_INPUT',
                'Invalid task list: [0].subtasks[0].subtasks[0].content: must not be empty',
            ],
            [
                'a section on a subtask',
                '[{"content": "Plan", "subtasks": [{"content": "Draft", "section": "Planning"}]}]',
                'INVALID_INPUT',
                "Invalid task list: [0].subtasks[0].section: a subtask goes in its parent's section",
            ],
        ])('rejects %s before calling the API', async (_name, input, code, message) => {
            mockStdin(input)

            await expect(
                createProgram().parseAsync([
                    'node',
                    'td',
                    'task',
                    'add-many',
                    '--project',
                    'Work',
                    '--stdin',
                ]),
            ).rejects.toMatchObject({ code, message })
            expect(mockApi.getProjects).not.toHaveBeenCalled()
            expect(mockApi.sync).not.toHaveBeenCalled()
        })

        it('lists every problem, not just the first', async () => {
            mockStdin('[{"content": ""}, {"content": "Book venue", "priority": "high"}]')

            await expect(
                createProgram().parseAsync(['node', 'td', 'task', 'add-many', '--stdin']),
            ).rejects.toMatchObject({
                code: 'INVALID_INPUT',
                message:
                    'Invalid task list: [0].content: must not be empty; [1].priority: expected p1, p2, p3 or p4',
            })
        })
    })

    describe('--dry-run', () => {
        beforeEach(() => {
            mockApi.getSections.mockResolvedValue({
                results: [fixtures.sections.planning],
                nextCursor: null,
            })
        })

        it('previews the sections and task tree without sending anything', async () => {
            const consoleSpy = captureConsole()
            mockStdin(
                JSON.stringify([
                    {
                        content: 'Book venue',
                        section: 'Launch',
                        due: 'friday',
                        priority: 'P2',
                        subtasks: [{ content: 'Get quotes', labels: ['@money'], duration: '1h' }],
                    },
                    { content: 'Draft brief', section: 'planning', deadline: '2026-12-01' },
                ]),
            )

            await createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
                '--dry-run',
            ])

            expect(mockApi.sync).not.toHaveBeenCalled()
            expect(consoleSpy.mock.calls.map((call) => call[0])).toEqual([
                '[dry-run] Would add 3 tasks and 1 new section to Work:',
                '  New section: Launch',
                '  - Book venue (section: Launch, due: friday, priority: p2)',
                '    - Get quotes (labels: money, duration: 1h)',
                '  - Draft brief (section: Planning, deadline: 2026-12-01)',
                'Run without --dry-run to execute.',
            ])
        })

        it('previews additions to the Inbox when no --project is given', async () => {
            const consoleSpy = captureConsole()
            mockStdin(JSON.stringify([{ content: 'Call the bank' }]))

            await createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--stdin',
                '--dry-run',
            ])

            expect(mockApi.sync).not.toHaveBeenCalled()
            expect(consoleSpy.mock.calls.map((call) => call[0])).toEqual([
                '[dry-run] Would add 1 task to the Inbox:',
                '  - Call the bank',
                'Run without --dry-run to execute.',
            ])
        })
    })

    describe('output', () => {
        beforeEach(() => {
            mockApi.getSections.mockResolvedValue({
                results: [fixtures.sections.planning],
                nextCursor: null,
            })
            mockStdin(
                JSON.stringify([
                    {
                        content: 'Book venue',
                        section: 'Launch',
                        subtasks: [{ content: 'Get quotes' }],
                    },
                    { content: 'Draft brief', section: 'Planning' },
                ]),
            )
        })

        afterEach(() => {
            resetGlobalArgs()
        })

        function run(...extra: string[]) {
            return createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
                ...extra,
            ])
        }

        it('lists what it created, name first and ID after', async () => {
            const consoleSpy = captureConsole()
            fakeSync(mockApi)

            await run()

            expect(consoleSpy.mock.calls.map((call) => call[0])).toEqual([
                'Created 3 tasks and 1 section in Work',
                '  Section: Launch (id:sec-new-1)',
                '  - Book venue (id:task-new-2)',
                '    - Get quotes (id:task-new-3)',
                '  - Draft brief (id:task-new-4)',
            ])
        })

        it('prints the created sections and tasks as JSON with --json', async () => {
            const consoleSpy = captureConsole()
            fakeSync(mockApi)

            await run('--json')

            expect(consoleSpy).toHaveBeenCalledTimes(1)
            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
                projectId: 'proj-work',
                sections: [{ id: 'sec-new-1', name: 'Launch' }],
                tasks: [
                    {
                        id: 'task-new-2',
                        content: 'Book venue',
                        sectionId: 'sec-new-1',
                        parentId: null,
                    },
                    {
                        id: 'task-new-3',
                        content: 'Get quotes',
                        sectionId: 'sec-new-1',
                        parentId: 'task-new-2',
                    },
                    {
                        id: 'task-new-4',
                        content: 'Draft brief',
                        sectionId: 'sec-1',
                        parentId: null,
                    },
                ],
                failures: [],
            })
        })

        it('prints only the task IDs, one per line, with --quiet', async () => {
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--quiet', 'task', 'add-many']
            resetGlobalArgs()
            try {
                const consoleSpy = captureConsole()
                fakeSync(mockApi)

                await run()

                expect(consoleSpy.mock.calls.map((call) => call[0])).toEqual([
                    'task-new-2\ntask-new-3\ntask-new-4',
                ])
            } finally {
                process.argv = originalArgv
            }
        })
    })

    it('refuses to add to an archived project', async () => {
        mockApi.getProjects.mockResolvedValue({
            results: [{ ...fixtures.projects.work, isArchived: true }],
            nextCursor: null,
        })
        mockStdin(JSON.stringify([{ content: 'Draft brief' }]))

        await expect(
            createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
            ]),
        ).rejects.toMatchObject({ code: 'PROJECT_ARCHIVED' })
        expect(mockApi.sync).not.toHaveBeenCalled()
    })

    describe('when some items fail', () => {
        function run(tasks: unknown[], ...extra: string[]) {
            mockStdin(JSON.stringify(tasks))
            return createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
                ...extra,
            ])
        }

        const tasks = [
            { content: 'Book venue', subtasks: [{ content: 'Get quotes' }] },
            { content: 'Draft brief' },
        ]

        it('reports what was created, what failed and what was skipped, then fails', async () => {
            const consoleSpy = captureConsole()
            fakeSync(mockApi, {
                fail: (command) =>
                    command.args.content === 'Book venue' ? 'Invalid argument value' : undefined,
            })

            await expect(run(tasks)).rejects.toMatchObject({
                code: 'PARTIAL_FAILURE',
                message: '2 of 3 tasks were not created.',
            })

            expect(consoleSpy.mock.calls.map((call) => call[0])).toEqual([
                'Created 1 task in Work',
                '  - Draft brief (id:task-new-1)',
                'Failed: Book venue: Invalid argument value',
                'Skipped: Get quotes: parent "Book venue" was not created',
            ])
        })

        it('skips the tasks in a section that could not be created', async () => {
            const consoleSpy = captureConsole()
            mockApi.getSections.mockResolvedValue({ results: [], nextCursor: null })
            fakeSync(mockApi, {
                fail: (command) => (command.type === 'section_add' ? 'Name too long' : undefined),
            })

            await expect(
                run([{ content: 'Book venue', section: 'Launch' }, { content: 'Draft brief' }]),
            ).rejects.toMatchObject({
                code: 'PARTIAL_FAILURE',
                message: '1 of 2 tasks and 1 of 1 section were not created.',
            })

            expect(consoleSpy.mock.calls.map((call) => call[0])).toEqual([
                'Created 1 task in Work',
                '  - Draft brief (id:task-new-1)',
                'Failed: section Launch: Name too long',
                'Skipped: Book venue: section "Launch" was not created',
            ])
        })

        it('lists failures with their input path in --json output', async () => {
            const consoleSpy = captureConsole()
            fakeSync(mockApi, {
                fail: (command) =>
                    command.args.content === 'Book venue' ? 'Invalid argument value' : undefined,
            })

            await expect(run(tasks, '--json')).rejects.toMatchObject({ code: 'PARTIAL_FAILURE' })

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
                projectId: 'proj-work',
                sections: [],
                tasks: [
                    { id: 'task-new-1', content: 'Draft brief', sectionId: null, parentId: null },
                ],
                failures: [
                    {
                        type: 'task',
                        path: '[0]',
                        content: 'Book venue',
                        error: 'Invalid argument value',
                    },
                    {
                        type: 'task',
                        path: '[0].subtasks[0]',
                        content: 'Get quotes',
                        error: 'parent "Book venue" was not created',
                    },
                ],
            })
        })

        it('passes on an error that stops the whole request, when nothing was created', async () => {
            mockApi.sync.mockRejectedValue(new CliError('RATE_LIMITED', 'Too many requests'))

            await expect(run(tasks)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
        })
    })

    describe('more than 100 commands', () => {
        function subtasks(count: number) {
            return Array.from({ length: count }, (_, index) => ({ content: `Step ${index + 1}` }))
        }

        function run(tasks: unknown[]) {
            mockStdin(JSON.stringify(tasks))
            return createProgram().parseAsync([
                'node',
                'td',
                'task',
                'add-many',
                '--project',
                'Work',
                '--stdin',
            ])
        }

        it('splits them into requests of 100, using real IDs from earlier requests', async () => {
            const consoleSpy = captureConsole()
            const requests = fakeSync(mockApi)

            await run([{ content: 'Plan launch', subtasks: subtasks(150) }])

            expect(requests.map((commands) => commands.length)).toEqual([100, 51])
            expect(requests[1][0].args).toEqual({ content: 'Step 100', parentId: 'task-new-1' })
            expect(requests[1].every((command) => command.args.parentId === 'task-new-1')).toBe(
                true,
            )
            expect(consoleSpy).toHaveBeenCalledWith('Created 151 tasks in Work')
        })

        it('does not send items whose parent failed in an earlier request', async () => {
            const consoleSpy = captureConsole()
            const requests = fakeSync(mockApi, {
                fail: (command) =>
                    command.args.content === 'Plan launch' ? 'Invalid argument value' : undefined,
            })

            await expect(
                run([{ content: 'Plan launch', subtasks: subtasks(150) }]),
            ).rejects.toMatchObject({
                code: 'PARTIAL_FAILURE',
                message: '151 of 151 tasks were not created.',
            })

            expect(requests).toHaveLength(1)
            expect(consoleSpy).toHaveBeenCalledWith(
                'Skipped: Step 150: parent "Plan launch" was not created',
            )
        })

        it('reports what earlier requests created when a later request fails outright', async () => {
            const consoleSpy = captureConsole()
            fakeSync(mockApi)
            const fakeServer = mockApi.sync.getMockImplementation()
            mockApi.sync
                .mockImplementationOnce(fakeServer as NonNullable<typeof fakeServer>)
                .mockRejectedValueOnce(new CliError('RATE_LIMITED', 'Too many requests'))
            const tasks = Array.from({ length: 101 }, (_, index) => ({
                content: `Task ${index + 1}`,
            }))

            await expect(run(tasks)).rejects.toMatchObject({
                code: 'PARTIAL_FAILURE',
                message: '1 of 101 tasks was not created.',
            })

            expect(consoleSpy).toHaveBeenCalledWith('Created 100 tasks in Work')
            expect(consoleSpy).toHaveBeenCalledWith('Failed: Task 101: not sent: Too many requests')
        })
    })

    describe('documenting the input', () => {
        type JsonSchema = {
            type?: string
            items?: { $ref?: string }
            $defs: Record<
                string,
                {
                    required: string[]
                    additionalProperties: boolean
                    properties: Record<string, { pattern?: string; items?: { $ref?: string } }>
                }
            >
        }

        async function printSchema(): Promise<JsonSchema> {
            const consoleSpy = captureConsole()
            await createProgram().parseAsync(['node', 'td', 'task', 'add-many', '--schema'])
            return JSON.parse(consoleSpy.mock.calls[0][0] as string) as JsonSchema
        }

        async function captureHelp(): Promise<string> {
            const stdoutSpy = captureStream()
            await expect(
                createProgram().parseAsync(['node', 'td', 'task', 'add-many', '--help']),
            ).rejects.toThrow()
            return stdoutSpy.mock.calls.map((c) => String(c[0])).join('')
        }

        it('prints the JSON Schema of the task list with --schema, without needing input', async () => {
            const schema = await printSchema()

            expect(schema.type).toBe('array')
            expect(schema.items?.$ref).toBe('#/$defs/task')
            const task = schema.$defs.task
            expect(Object.keys(task.properties)).toEqual([
                'content',
                'description',
                'due',
                'deadline',
                'priority',
                'labels',
                'duration',
                'assignee',
                'section',
                'subtasks',
            ])
            expect(task.required).toEqual(['content'])
            expect(task.additionalProperties).toBe(false)
            expect(task.properties.priority.pattern).toBe('^[pP][1-4]$')
            expect(task.properties.subtasks.items?.$ref).toBe('#/$defs/task')
            expect(mockApi.getProjects).not.toHaveBeenCalled()
            expect(mockApi.sync).not.toHaveBeenCalled()
        })

        it('names every field in --help', async () => {
            const fields = Object.keys((await printSchema()).$defs.task.properties)
            const help = await captureHelp()

            for (const field of fields) {
                expect(help).toMatch(new RegExp(`^ +${field} `, 'm'))
            }
            expect(help).toContain('--schema')
        })

        it('names every field in the agent skill', async () => {
            const fields = Object.keys((await printSchema()).$defs.task.properties)
            const start = SKILL_CONTENT.indexOf('td task add-many')
            expect(start).toBeGreaterThan(-1)
            const section = SKILL_CONTENT.slice(start, SKILL_CONTENT.indexOf('\n### ', start))

            for (const field of fields) {
                expect(section).toContain(`\`${field}\``)
            }
            expect(section).toContain('td task add-many --schema')
        })
    })
})

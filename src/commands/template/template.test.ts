import fs from 'node:fs'
import { open } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:fs/promises', () => ({
    open: vi.fn(),
}))
vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))
vi.mock('../../lib/refs.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/refs.js')>()
    return {
        ...actual,
        resolveProjectRef: vi.fn(),
        resolveWorkspaceRef: vi.fn(),
    }
})

import { getApi } from '../../lib/api/core.js'
import { resolveProjectRef, resolveWorkspaceRef } from '../../lib/refs.js'
import { fixtures } from '../../test-support/fixtures.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import { createTestProgram } from '../../test-support/program.js'
import { registerTemplateCommand } from './index.js'

const mockGetApi = vi.mocked(getApi)
const mockResolveProjectRef = vi.mocked(resolveProjectRef)
const mockResolveWorkspaceRef = vi.mocked(resolveWorkspaceRef)

function createProgram() {
    return createTestProgram(registerTemplateCommand)
}

describe('template', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockResolveProjectRef.mockResolvedValue(fixtures.projects.work)
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    describe('export-file', () => {
        it('exports template as CSV to stdout', async () => {
            const program = createProgram()
            mockApi.exportTemplateAsFile.mockResolvedValue('task,priority\nBuy milk,4')
            const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'td', 'template', 'export-file', 'Work'])

            expect(mockResolveProjectRef).toHaveBeenCalledWith(mockApi, 'Work')
            expect(mockApi.exportTemplateAsFile).toHaveBeenCalledWith({
                projectId: fixtures.projects.work.id,
                useRelativeDates: undefined,
            })
            expect(stdoutSpy).toHaveBeenCalledWith('task,priority\nBuy milk,4')
            stdoutSpy.mockRestore()
        })

        it('writes template to file with --output', async () => {
            const program = createProgram()
            mockApi.exportTemplateAsFile.mockResolvedValue('task,priority\nBuy milk,4')

            await program.parseAsync([
                'node',
                'td',
                'template',
                'export-file',
                'Work',
                '--output',
                '/tmp/template.csv',
            ])

            expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
                '/tmp/template.csv',
                'task,priority\nBuy milk,4',
                'utf-8',
            )
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Template written to'))
        })

        it('passes --relative-dates flag', async () => {
            const program = createProgram()
            mockApi.exportTemplateAsFile.mockResolvedValue('content')
            const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync([
                'node',
                'td',
                'template',
                'export-file',
                'Work',
                '--relative-dates',
            ])

            expect(mockApi.exportTemplateAsFile).toHaveBeenCalledWith({
                projectId: fixtures.projects.work.id,
                useRelativeDates: true,
            })
            stdoutSpy.mockRestore()
        })

        it('outputs JSON with --json', async () => {
            const program = createProgram()
            mockApi.exportTemplateAsFile.mockResolvedValue('csv content')

            await program.parseAsync(['node', 'td', 'template', 'export-file', 'Work', '--json'])

            const output = consoleSpy.mock.calls[0][0] as string
            const parsed = JSON.parse(output)
            expect(parsed.content).toBe('csv content')
        })

        it('accepts --project flag', async () => {
            const program = createProgram()
            mockApi.exportTemplateAsFile.mockResolvedValue('content')
            const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'td', 'template', 'export-file', '--project', 'Work'])

            expect(mockResolveProjectRef).toHaveBeenCalledWith(mockApi, 'Work')
            stdoutSpy.mockRestore()
        })
    })

    describe('export-url', () => {
        it('displays file name and URL', async () => {
            const program = createProgram()
            mockApi.exportTemplateAsUrl.mockResolvedValue({
                fileName: 'template.csv',
                fileUrl: 'https://example.com/template.csv',
            })

            await program.parseAsync(['node', 'td', 'template', 'export-url', 'Work'])

            expect(mockResolveProjectRef).toHaveBeenCalledWith(mockApi, 'Work')
            expect(mockApi.exportTemplateAsUrl).toHaveBeenCalledWith({
                projectId: fixtures.projects.work.id,
                useRelativeDates: undefined,
            })
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('template.csv'))
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('https://example.com/template.csv'),
            )
        })

        it('outputs JSON with --json', async () => {
            const program = createProgram()
            mockApi.exportTemplateAsUrl.mockResolvedValue({
                fileName: 'template.csv',
                fileUrl: 'https://example.com/template.csv',
            })

            await program.parseAsync(['node', 'td', 'template', 'export-url', 'Work', '--json'])

            const output = consoleSpy.mock.calls[0][0] as string
            const parsed = JSON.parse(output)
            expect(parsed.fileName).toBe('template.csv')
            expect(parsed.fileUrl).toBe('https://example.com/template.csv')
        })
    })

    describe('create', () => {
        beforeEach(() => {
            vi.mocked(open).mockResolvedValue({ close: vi.fn() } as unknown as Awaited<
                ReturnType<typeof open>
            >)
            vi.mocked(fs.openAsBlob).mockResolvedValue(new Blob([Buffer.from('template content')]))
        })

        it('creates project from template file', async () => {
            const program = createProgram()
            mockApi.createProjectFromTemplate.mockResolvedValue({
                status: 'ok',
                projectId: 'new-proj-1',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [fixtures.tasks.basic],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'create',
                '--name',
                'My Project',
                '--file',
                '/tmp/template.csv',
            ])

            const createArg = mockApi.createProjectFromTemplate.mock.calls[0][0]
            expect(createArg).toMatchObject({
                name: 'My Project',
                fileName: 'template.csv',
                workspaceId: undefined,
            })
            expect(createArg.file).toBeInstanceOf(Blob)
            expect(await (createArg.file as Blob).text()).toBe('template content')
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Created project: My Project'),
            )
        })

        it('forwards --file-name to api.createProjectFromTemplate (overrides basename)', async () => {
            const program = createProgram()
            mockApi.createProjectFromTemplate.mockResolvedValue({
                status: 'ok',
                projectId: 'new-proj-1',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'create',
                '--name',
                'My Project',
                '--file',
                '/tmp/template.csv',
                '--file-name',
                'override.csv',
            ])

            const createArg = mockApi.createProjectFromTemplate.mock.calls[0][0]
            expect(createArg.fileName).toBe('override.csv')
        })

        it('resolves workspace ref when --workspace is provided', async () => {
            const program = createProgram()
            mockResolveWorkspaceRef.mockResolvedValue({
                id: 'ws-1',
                name: 'My Workspace',
            } as Awaited<ReturnType<typeof resolveWorkspaceRef>>)
            mockApi.createProjectFromTemplate.mockResolvedValue({
                status: 'ok',
                projectId: 'new-proj-1',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'create',
                '--name',
                'WS Project',
                '--file',
                '/tmp/template.csv',
                '--workspace',
                'My Workspace',
            ])

            expect(mockResolveWorkspaceRef).toHaveBeenCalledWith('My Workspace')
            expect(mockApi.createProjectFromTemplate).toHaveBeenCalledWith(
                expect.objectContaining({ workspaceId: 'ws-1' }),
            )
        })

        it('outputs JSON with --json', async () => {
            const program = createProgram()
            mockApi.createProjectFromTemplate.mockResolvedValue({
                status: 'ok',
                projectId: 'new-proj-1',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'create',
                '--name',
                'Test',
                '--file',
                '/tmp/template.csv',
                '--json',
            ])

            const output = consoleSpy.mock.calls[0][0] as string
            const parsed = JSON.parse(output)
            expect(parsed.status).toBe('ok')
            expect(parsed.projectId).toBe('new-proj-1')
        })

        it('shows dry-run preview', async () => {
            const program = createProgram()

            await program.parseAsync([
                'node',
                'td',
                'template',
                'create',
                '--name',
                'Test',
                '--file',
                '/tmp/template.csv',
                '--dry-run',
            ])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
            expect(mockApi.createProjectFromTemplate).not.toHaveBeenCalled()
        })

        it('errors when file does not exist', async () => {
            const program = createProgram()
            vi.mocked(open).mockRejectedValue(
                Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
            )

            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'template',
                    'create',
                    '--name',
                    'Test',
                    '--file',
                    '/tmp/nonexistent.csv',
                ]),
            ).rejects.toThrow('not found')
            // File validation runs before any API/ref work — if a
            // future change reorders that, these mocks would record a
            // call and this test would catch the regression.
            expect(mockGetApi).not.toHaveBeenCalled()
            expect(mockResolveWorkspaceRef).not.toHaveBeenCalled()
        })
    })

    describe('import-file', () => {
        beforeEach(() => {
            vi.mocked(open).mockResolvedValue({ close: vi.fn() } as unknown as Awaited<
                ReturnType<typeof open>
            >)
            vi.mocked(fs.openAsBlob).mockResolvedValue(new Blob([Buffer.from('template content')]))
        })

        it('imports template file into project', async () => {
            const program = createProgram()
            mockApi.importTemplateIntoProject.mockResolvedValue({
                status: 'ok',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [fixtures.tasks.basic],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-file',
                'Work',
                '--file',
                '/tmp/template.csv',
            ])

            expect(mockResolveProjectRef).toHaveBeenCalledWith(mockApi, 'Work')
            const importArg = mockApi.importTemplateIntoProject.mock.calls[0][0]
            expect(importArg).toMatchObject({
                projectId: fixtures.projects.work.id,
                fileName: 'template.csv',
            })
            expect(importArg.file).toBeInstanceOf(Blob)
            expect(await (importArg.file as Blob).text()).toBe('template content')
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 tasks'))
        })

        it('forwards --file-name to api.importTemplateIntoProject (overrides basename)', async () => {
            const program = createProgram()
            mockApi.importTemplateIntoProject.mockResolvedValue({
                status: 'ok',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-file',
                'Work',
                '--file',
                '/tmp/template.csv',
                '--file-name',
                'override.csv',
            ])

            const importArg = mockApi.importTemplateIntoProject.mock.calls[0][0]
            expect(importArg.fileName).toBe('override.csv')
        })

        it('outputs JSON with --json', async () => {
            const program = createProgram()
            mockApi.importTemplateIntoProject.mockResolvedValue({
                status: 'ok',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-file',
                'Work',
                '--file',
                '/tmp/template.csv',
                '--json',
            ])

            const output = consoleSpy.mock.calls[0][0] as string
            const parsed = JSON.parse(output)
            expect(parsed.status).toBe('ok')
        })

        it('shows dry-run preview', async () => {
            const program = createProgram()

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-file',
                'Work',
                '--file',
                '/tmp/template.csv',
                '--dry-run',
            ])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
            expect(mockApi.importTemplateIntoProject).not.toHaveBeenCalled()
        })

        it('errors with FILE_NOT_FOUND when the --file path does not exist', async () => {
            const program = createProgram()
            vi.mocked(open).mockRejectedValue(
                Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
            )

            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'template',
                    'import-file',
                    'Work',
                    '--file',
                    '/tmp/nonexistent.csv',
                ]),
            ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
            // File validation runs before any API/ref work — if a
            // future change reorders that, these mocks would record a
            // call and this test would catch the regression.
            expect(mockGetApi).not.toHaveBeenCalled()
            expect(mockResolveProjectRef).not.toHaveBeenCalled()
        })
    })

    describe('import-id', () => {
        it('imports template by ID into project', async () => {
            const program = createProgram()
            mockApi.importTemplateFromId.mockResolvedValue({
                status: 'ok',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [fixtures.tasks.basic, fixtures.tasks.withDue],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-id',
                'Work',
                '--template-id',
                'product-launch',
            ])

            expect(mockResolveProjectRef).toHaveBeenCalledWith(mockApi, 'Work')
            expect(mockApi.importTemplateFromId).toHaveBeenCalledWith({
                projectId: fixtures.projects.work.id,
                templateId: 'product-launch',
                locale: undefined,
            })
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2 tasks'))
        })

        it('passes locale option', async () => {
            const program = createProgram()
            mockApi.importTemplateFromId.mockResolvedValue({
                status: 'ok',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-id',
                'Work',
                '--template-id',
                'product-launch',
                '--locale',
                'fr',
            ])

            expect(mockApi.importTemplateFromId).toHaveBeenCalledWith({
                projectId: fixtures.projects.work.id,
                templateId: 'product-launch',
                locale: 'fr',
            })
        })

        it('outputs JSON with --json', async () => {
            const program = createProgram()
            mockApi.importTemplateFromId.mockResolvedValue({
                status: 'ok',
                templateType: 'project',
                projects: [],
                sections: [],
                tasks: [],
                comments: [],
            })

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-id',
                'Work',
                '--template-id',
                'test-id',
                '--json',
            ])

            const output = consoleSpy.mock.calls[0][0] as string
            const parsed = JSON.parse(output)
            expect(parsed.status).toBe('ok')
        })

        it('shows dry-run preview', async () => {
            const program = createProgram()

            await program.parseAsync([
                'node',
                'td',
                'template',
                'import-id',
                'Work',
                '--template-id',
                'test-id',
                '--dry-run',
            ])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
            expect(mockApi.importTemplateFromId).not.toHaveBeenCalled()
        })
    })
})

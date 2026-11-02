import { createTestProgram } from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/global-args.js', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    isJsonMode: vi.fn(() => false),
}))

import { isJsonMode } from '../lib/global-args.js'
import { createWatchEvent } from '../lib/watch/core.js'
import { registerWatchCommand, renderHumanEvent } from './watch.js'

function runWatch(...args: string[]) {
    const program = createTestProgram(registerWatchCommand)
    return program.parseAsync(['node', 'td', 'watch', ...args])
}

describe('watch command validation', () => {
    beforeEach(() => {
        vi.mocked(isJsonMode).mockReturnValue(false)
    })

    it('requires at least one --resource and lists valid choices', async () => {
        await expect(runWatch()).rejects.toMatchObject({
            code: 'INVALID_OPTIONS',
            message: expect.stringMatching(/at least one --resource/i),
            hints: expect.arrayContaining([expect.stringContaining('workspace-member')]),
        })
    })

    it('rejects unknown resources with the valid list', async () => {
        await expect(runWatch('--resource', 'task,bogus')).rejects.toMatchObject({
            code: 'INVALID_OPTIONS',
            message: expect.stringContaining('bogus'),
            hints: expect.arrayContaining([expect.stringContaining('task, project, section')]),
        })
    })

    it('rejects --label unless only tasks are watched', async () => {
        await expect(
            runWatch('--resource', 'task,comment', '--label', 'urgent'),
        ).rejects.toMatchObject({
            message: expect.stringMatching(/--label is valid only when watching tasks/),
        })
    })

    it('rejects --project for resources without a project relationship', async () => {
        await expect(runWatch('--resource', 'label', '--project', 'Work')).rejects.toMatchObject({
            message: expect.stringMatching(/--project cannot filter these resources: label/),
        })
    })

    it('rejects --workspace for resources without a workspace relationship', async () => {
        await expect(
            runWatch('--resource', 'filter', '--workspace', 'Doist'),
        ).rejects.toMatchObject({
            message: expect.stringMatching(/--workspace cannot filter these resources: filter/),
        })
    })

    it('rejects global --json in favor of --ndjson', async () => {
        vi.mocked(isJsonMode).mockReturnValue(true)
        await expect(runWatch('--resource', 'task')).rejects.toMatchObject({
            code: 'INVALID_OPTIONS',
            hints: expect.arrayContaining([expect.stringContaining('--ndjson')]),
        })
    })
})

describe('renderHumanEvent', () => {
    it('renders a changed task as a compact block', () => {
        const output = renderHumanEvent(
            createWatchEvent({
                source: 'todoist',
                accountId: 'user-1',
                resourceType: 'task',
                changeType: 'changed',
                resourceId: 'task-1',
                data: {
                    id: 'task-1',
                    content: 'Buy milk',
                    priority: 4,
                    labels: ['urgent'],
                    projectId: 'proj-1',
                    checked: true,
                },
            }),
        )
        expect(output).toContain('task')
        expect(output).toContain('added or changed')
        expect(output).toContain('task-1')
        expect(output).toContain('content: Buy milk')
        expect(output).toContain('labels: urgent')
        expect(output).toContain('completed: yes')
        expect(output).toContain('project: proj-1')
        expect(output).toMatch(/^\d{2}:\d{2}:\d{2} /)
    })

    it('renders deletions without requiring resource data', () => {
        const output = renderHumanEvent(
            createWatchEvent({
                source: 'todoist',
                accountId: 'user-1',
                resourceType: 'task',
                changeType: 'deleted',
                resourceId: 'task-1',
                data: { id: 'task-1', isDeleted: true },
            }),
        )
        expect(output).toContain('deleted')
        expect(output).toContain('task-1')
    })

    it('renders stream resets with refresh guidance', () => {
        const output = renderHumanEvent(
            createWatchEvent({
                source: 'todoist',
                accountId: 'user-1',
                resourceType: null,
                changeType: 'reset',
                resourceId: null,
                data: { reason: 'incremental-sync-unavailable' },
            }),
        )
        expect(output).toContain('stream reset')
        expect(output).toContain('re-read current state')
    })

    it('keeps untrusted content from corrupting terminal output', () => {
        const output = renderHumanEvent(
            createWatchEvent({
                source: 'todoist',
                accountId: 'user-1',
                resourceType: 'task',
                changeType: 'changed',
                resourceId: 'task-1',
                data: { id: 'task-1', content: 'evil\u001b[2Jline\nbreak' },
            }),
        )
        expect(output).not.toContain('\u001b')
        expect(output).toContain('content: evil[2Jline break')
    })
})

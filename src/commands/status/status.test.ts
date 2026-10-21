import { captureConsole, createTestProgram } from '@doist/cli-core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    fetchUserStatus: vi.fn(),
    writeUserStatus: vi.fn(),
}))

vi.mock('../../lib/api/user-status.js', () => ({
    fetchUserStatus: apiMocks.fetchUserStatus,
    writeUserStatus: apiMocks.writeUserStatus,
}))

vi.mock('chalk')

import { resetGlobalArgs } from '../../lib/global-args.js'
import { enableMutationJson } from '../../lib/mutation-json.js'
import { registerStatusCommand } from './index.js'

async function run(...args: string[]): Promise<void> {
    const program = createTestProgram(registerStatusCommand)
    await program.parseAsync(['node', 'td', 'status', ...args])
}

async function runWithMutationJson(...args: string[]): Promise<void> {
    const program = createTestProgram(registerStatusCommand)
    enableMutationJson(program)
    await program.parseAsync(['node', 'td', 'status', ...args])
}

const logged = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map((call) => call.join(' ')).join('\n')

describe('td status', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.writeUserStatus.mockResolvedValue(null)
    })

    describe('view', () => {
        it('is the default subcommand and prints the status', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Deep work',
                emoji: '🎯',
                effects: { pauseNotifications: { scope: { mode: 'all' } } },
            })
            const spy = captureConsole('log')
            await run()
            expect(logged(spy)).toBe('🎯 Deep work (notifications paused)')
        })

        it('prints the expiry when the status has one', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Focus',
                emoji: '🎯',
                activeUntil: new Date('2026-10-14T13:30:00.000Z'),
                effects: {},
            })
            const spy = captureConsole('log')
            await run('view')
            expect(logged(spy)).toBe('🎯 Focus (until Oct 14, 2026, 1:30 PM)')
        })

        it('joins the expiry and the pause in one parenthesis', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Focus',
                emoji: '🎯',
                activeUntil: new Date('2026-10-14T13:30:00.000Z'),
                effects: { pauseNotifications: { scope: { mode: 'all' } } },
            })
            const spy = captureConsole('log')
            await run('view')
            expect(logged(spy)).toBe('🎯 Focus (until Oct 14, 2026, 1:30 PM, notifications paused)')
        })

        it('shows a status whose only effect is pause activity', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Away',
                effects: { pauseActivity: { scope: { mode: 'all' } } },
            })
            const spy = captureConsole('log')
            await run('view')
            expect(logged(spy)).toBe('Away (activity paused)')
        })

        it('lists both pauses after the expiry', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Focus',
                activeUntil: new Date('2026-10-14T13:30:00.000Z'),
                effects: {
                    pauseNotifications: { scope: { mode: 'all' } },
                    pauseActivity: { scope: { mode: 'all' } },
                },
            })
            const spy = captureConsole('log')
            await run('view')
            expect(logged(spy)).toBe(
                'Focus (until Oct 14, 2026, 1:30 PM, notifications paused, activity paused)',
            )
        })

        it('says so when there is no status', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue(null)
            const spy = captureConsole('log')
            await run('view')
            expect(logged(spy)).toBe('No status set.')
        })

        it('prints null in JSON when there is no status', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue(null)
            const spy = captureConsole('log')
            await run('view', '--json')
            expect(JSON.parse(logged(spy))).toEqual({ status: null })
        })

        it('reaches view through the default subcommand with --json', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({ message: 'Away', effects: {} })
            const spy = captureConsole('log')
            await run('--json')
            expect(JSON.parse(logged(spy))).toEqual({
                status: { message: 'Away', effects: {} },
            })
        })
    })

    describe('clear', () => {
        it('clears the status', async () => {
            const spy = captureConsole('log')
            await run('clear')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith(null)
            expect(logged(spy)).toBe('Status cleared.')
        })

        it('shows the status it would clear on --dry-run, without writing', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Focus',
                emoji: '🎯',
                effects: {},
            })
            const spy = captureConsole('log')
            await run('clear', '--dry-run')
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            expect(logged(spy)).toContain('Would clear status')
            expect(logged(spy)).toContain('Status: 🎯 Focus')
        })

        it('says no status is set on --dry-run with no status', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue(null)
            const spy = captureConsole('log')
            await run('clear', '--dry-run')
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            expect(logged(spy)).toContain('Status: none set')
        })
    })

    describe('clear --json', () => {
        it('prints the mutation envelope after clearing', async () => {
            const spy = captureConsole('log')
            await runWithMutationJson('clear', '--json')
            expect(JSON.parse(logged(spy))).toMatchObject({
                ok: true,
                command: 'td status clear',
                messages: ['Status cleared.'],
            })
        })

        it('prints a preview envelope on --dry-run and clears nothing', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Focus',
                emoji: '🎯',
                effects: {},
            })
            const spy = captureConsole('log')
            await runWithMutationJson('clear', '--dry-run', '--json')
            const envelope = JSON.parse(logged(spy))
            expect(envelope).toMatchObject({ status: 'preview', command: 'td status clear' })
            expect(envelope.messages.join('\n')).toContain('Status: 🎯 Focus')
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
        })
    })

    describe('--quiet', () => {
        afterEach(() => {
            resetGlobalArgs()
        })

        it('prints no success line for clear', async () => {
            const args = ['clear']
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--quiet', 'status', ...args]
            resetGlobalArgs()
            try {
                const spy = captureConsole('log')
                await run(...args)
                expect(apiMocks.writeUserStatus).toHaveBeenCalledTimes(1)
                expect(spy).not.toHaveBeenCalled()
            } finally {
                process.argv = originalArgv
            }
        })
    })

    describe('reports what the server returned', () => {
        it('clear fails with INVALID_STATE, naming the status, while one is still returned', async () => {
            apiMocks.writeUserStatus.mockResolvedValue({ message: 'Still here', effects: {} })
            const spy = captureConsole('log')
            await expect(run('clear')).rejects.toMatchObject({
                code: 'INVALID_STATE',
                message: expect.stringContaining('Still here'),
            })
            expect(spy).not.toHaveBeenCalled()
        })
    })
})

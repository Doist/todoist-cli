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
import { registerStatusCommand } from './index.js'

async function run(...args: string[]): Promise<void> {
    const program = createTestProgram(registerStatusCommand)
    await program.parseAsync(['node', 'td', 'status', ...args])
}

const logged = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map((call) => call.join(' ')).join('\n')

const NOW = new Date('2026-10-14T12:00:00.000Z')

describe('td status', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
        apiMocks.writeUserStatus.mockResolvedValue(null)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('show', () => {
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

        it('says so when there is no status', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue(null)
            const spy = captureConsole('log')
            await run('show')
            expect(logged(spy)).toBe('No status set.')
        })

        it('prints null in JSON when there is no status', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue(null)
            const spy = captureConsole('log')
            await run('show', '--json')
            expect(JSON.parse(logged(spy))).toEqual({ status: null })
        })

        it('reaches show through the default subcommand with --json', async () => {
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

        it('says there is nothing to clear on --dry-run with no status', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue(null)
            const spy = captureConsole('log')
            await run('clear', '--dry-run')
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            expect(logged(spy)).toContain('Status: none (nothing to clear)')
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

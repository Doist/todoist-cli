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

const NOW = new Date('2026-10-14T12:00:00.000Z')

describe('td status', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
        apiMocks.writeUserStatus.mockImplementation(async (args) =>
            args ? { effects: {}, ...args } : null,
        )
    })

    afterEach(() => {
        vi.useRealTimers()
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

    describe('set', () => {
        it('sends the message alone when nothing else is given', async () => {
            captureConsole('log')
            await run('set', 'Away')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({ message: 'Away' })
        })

        it('sends emoji, an --until date and the pause effect', async () => {
            captureConsole('log')
            await run(
                'set',
                'Holiday',
                '--emoji',
                '🏝️',
                '--until',
                '2026-10-20T09:00:00Z',
                '--pause-notifications',
            )
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({
                message: 'Holiday',
                emoji: '🏝️',
                activeUntil: new Date('2026-10-20T09:00:00Z'),
                effects: { pauseNotifications: { scope: { mode: 'all' } } },
            })
        })

        it('turns --for into an expiry that long from now', async () => {
            captureConsole('log')
            await run('set', 'Focus', '--for', '1h30m')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({
                message: 'Focus',
                activeUntil: new Date('2026-10-14T13:30:00.000Z'),
            })
        })

        it('rejects --until together with --for before calling the API', async () => {
            await expect(
                run('set', 'Focus', '--until', '2026-10-20T09:00:00Z', '--for', '2h'),
            ).rejects.toThrow('Cannot use --until and --for together')
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
        })

        it.each([
            ['--until', 'next week'],
            ['--for', 'soon'],
            ['--for', '0m'],
            ['--until', ''],
            ['--for', ''],
        ])('rejects an invalid %s %j instead of setting no expiry', async (flag, value) => {
            await expect(run('set', 'Focus', flag, value)).rejects.toThrow(/Invalid --/)
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
        })

        it('reads a date-only --until as the start of that day', async () => {
            captureConsole('log')
            await run('set', 'Holiday', '--until', '2026-10-20')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({
                message: 'Holiday',
                activeUntil: new Date(2026, 9, 20),
            })
        })

        it('prints the expiry and the pause in the text output', async () => {
            apiMocks.writeUserStatus.mockResolvedValue({
                message: 'Focus',
                emoji: null,
                activeUntil: new Date('2026-10-14T13:30:00.000Z'),
                effects: { pauseNotifications: { scope: { mode: 'all' } } },
            })
            const spy = captureConsole('log')
            await run('set', 'Focus', '--for', '90m', '--pause-notifications')
            expect(logged(spy)).toBe(
                'Status set: Focus (until Oct 14, 2026, 1:30 PM, notifications paused)',
            )
        })

        it('does not call the API on --dry-run', async () => {
            const spy = captureConsole('log')
            await run(
                'set',
                'Focus',
                '--emoji',
                '🎯',
                '--until',
                '2026-10-20T09:00:00Z',
                '--pause-notifications',
                '--dry-run',
            )
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            const out = logged(spy)
            expect(out).toContain('Would set status')
            expect(out).toContain('Message: Focus')
            expect(out).toContain('Emoji: 🎯')
            expect(out).toContain('Until: Oct 20, 2026, 9:00 AM')
            expect(out).toContain('Pause notifications: yes')
        })

        it('prints the stored status in JSON', async () => {
            const spy = captureConsole('log')
            await run('set', 'Away', '--json')
            expect(JSON.parse(logged(spy))).toEqual({
                status: { message: 'Away', effects: {} },
            })
        })

        it('describes --pause-notifications as honoured only by apps that read the status', () => {
            const program = createTestProgram(registerStatusCommand)
            const set = program.commands
                .find((c) => c.name() === 'status')
                ?.commands.find((c) => c.name() === 'set')
            const help = set?.helpInformation() ?? ''
            expect(help).toContain('--pause-notifications')
            expect(help).toContain('Only apps that read the status honour it')
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

    describe('set without a message', () => {
        it('stops with usage instead of setting anything', async () => {
            captureConsole('log')
            await expect(run('set')).rejects.toThrow()
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
        })
    })

    describe('--quiet', () => {
        afterEach(() => {
            resetGlobalArgs()
        })

        it.each([[['set', 'Away']], [['clear']]])('prints no success line for %j', async (args) => {
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

    describe('set input guards', () => {
        const badInputs: Array<[string, string[]]> = [
            ['an empty message', ['']],
            ['a blank message', ['   ']],
            ['an 81 character message', ['x'.repeat(81)]],
            ['81 emoji', ['🎯'.repeat(81)]],
            ['an empty emoji', ['ok', '--emoji', '']],
            ['a blank emoji', ['ok', '--emoji', '  ']],
            ['an emoji that is really the next flag', ['ok', '--emoji', '--pause-notifications']],
            ['an impossible date', ['ok', '--until', '2026-02-30']],
            ['an impossible datetime', ['ok', '--until', '2026-02-31T10:00']],
            ['a month 13', ['ok', '--until', '2026-13-45']],
            ['a year only', ['ok', '--until', '2026']],
            ['today, which is already midnight past', ['ok', '--until', '2026-10-14']],
            ['a past datetime', ['ok', '--until', '2020-01-01T00:00:00Z']],
            ['an expiry equal to now', ['ok', '--until', '2026-10-14T12:00:00Z']],
            ['a duration that overflows to Infinity', ['ok', '--for', `${'9'.repeat(400)}m`]],
            ['a duration beyond the Date range', ['ok', '--for', '99999999999999d']],
        ]

        it.each(badInputs)('refuses %s, with and without --dry-run', async (_name, args) => {
            for (const extra of [[], ['--dry-run']]) {
                captureConsole('log')
                await expect(run('set', ...args, ...extra)).rejects.toThrow()
            }
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
        })

        it('explains midnight only when the past expiry was a date with no time', async () => {
            captureConsole('log')
            const dateOnly = await run('set', 'ok', '--until', '2026-10-14').catch((e) => e)
            expect(dateOnly.hints.join(' ')).toContain('midnight')

            const withTime = await run('set', 'ok', '--until', '2020-01-01T00:00:00Z').catch(
                (e) => e,
            )
            expect(withTime.code).toBe('INVALID_DATE')
            expect(withTime.hints.join(' ')).not.toContain('midnight')
            expect(withTime.hints.join(' ')).toContain('future')
        })

        it('sends the trimmed message', async () => {
            captureConsole('log')
            await run('set', '  Away  ')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({ message: 'Away' })
        })

        it.each([80, 41])('counts code points, not UTF-16 units: %i emoji', async (count) => {
            captureConsole('log')
            await run('set', '🎯'.repeat(count))
            expect(apiMocks.writeUserStatus).toHaveBeenCalledTimes(1)
        })

        it('accepts a datetime with an offset', async () => {
            captureConsole('log')
            await run('set', 'ok', '--until', '2026-10-20T09:00+02:00')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({
                message: 'ok',
                activeUntil: new Date('2026-10-20T07:00:00Z'),
            })
        })
    })

    describe('reports what the server returned', () => {
        it.each([[[]], [['--json']]])(
            'set %j fails with INVALID_STATE and prints no success line when no status is returned',
            async (extra) => {
                apiMocks.writeUserStatus.mockResolvedValue(null)
                const spy = captureConsole('log')
                await expect(run('set', 'Away', ...extra)).rejects.toMatchObject({
                    code: 'INVALID_STATE',
                    message: expect.stringContaining('no active status'),
                })
                expect(spy).not.toHaveBeenCalled()
            },
        )

        it('clear fails with INVALID_STATE, naming the status, while one is still returned', async () => {
            apiMocks.writeUserStatus.mockResolvedValue({ message: 'Still here', effects: {} })
            const spy = captureConsole('log')
            await expect(run('clear')).rejects.toMatchObject({
                code: 'INVALID_STATE',
                message: expect.stringContaining('Still here'),
            })
            expect(spy).not.toHaveBeenCalled()
        })

        it.each([
            ['message', { message: 'Someone else', effects: {} }],
            ['emoji', { message: 'Away', emoji: '🎯', effects: {} }],
            [
                'expiry',
                { message: 'Away', activeUntil: new Date('2030-01-01T00:00:00Z'), effects: {} },
            ],
            [
                'pause',
                { message: 'Away', effects: { pauseNotifications: { scope: { mode: 'all' } } } },
            ],
        ])('set fails when the returned %s is not the one sent', async (_field, returned) => {
            apiMocks.writeUserStatus.mockResolvedValue(returned)
            const spy = captureConsole('log')
            await expect(run('set', 'Away')).rejects.toMatchObject({
                code: 'INVALID_STATE',
                message: expect.stringContaining('different status'),
            })
            expect(spy).not.toHaveBeenCalled()
        })

        it('succeeds, with one line each, when set and clear do what was asked', async () => {
            const spy = captureConsole('log')
            await run('set', 'Away')
            await run('clear')
            expect(logged(spy)).toBe('Status set: Away\nStatus cleared.')
        })
    })
})

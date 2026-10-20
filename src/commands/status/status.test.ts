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

        it('prints the activity pause', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Away',
                effects: { pauseActivity: { scope: { mode: 'all' } } },
            })
            const spy = captureConsole('log')
            await run()
            expect(logged(spy)).toBe('Away (activity paused)')
        })

        it('prints both pauses when both are set', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({
                message: 'Away',
                effects: {
                    pauseNotifications: { scope: { mode: 'all' } },
                    pauseActivity: { scope: { mode: 'all' } },
                },
            })
            const spy = captureConsole('log')
            await run()
            expect(logged(spy)).toBe('Away (notifications paused, activity paused)')
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

        it('prints one line of NDJSON with --ndjson', async () => {
            apiMocks.fetchUserStatus.mockResolvedValue({ message: 'Away', effects: {} })
            const spy = captureConsole('log')
            await run('view', '--ndjson')
            const out = logged(spy)
            expect(out.split('\n')).toHaveLength(1)
            expect(JSON.parse(out)).toEqual({ status: { message: 'Away', effects: {} } })
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

        it('sends only the activity pause for --pause-activity', async () => {
            captureConsole('log')
            await run('set', 'Away', '--pause-activity')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({
                message: 'Away',
                effects: { pauseActivity: { scope: { mode: 'all' } } },
            })
        })

        it('sends both effects when both pauses are given', async () => {
            captureConsole('log')
            await run('set', 'Away', '--pause-notifications', '--pause-activity')
            expect(apiMocks.writeUserStatus).toHaveBeenCalledWith({
                message: 'Away',
                effects: {
                    pauseNotifications: { scope: { mode: 'all' } },
                    pauseActivity: { scope: { mode: 'all' } },
                },
            })
        })

        it('prints the activity pause in the text and JSON output', async () => {
            const spy = captureConsole('log')
            await run('set', 'Away', '--pause-activity')
            expect(logged(spy)).toBe('Status set: Away (activity paused)')
            spy.mockClear()
            await run('set', 'Away', '--pause-activity', '--json')
            expect(JSON.parse(logged(spy))).toEqual({
                status: {
                    message: 'Away',
                    effects: { pauseActivity: { scope: { mode: 'all' } } },
                },
            })
        })

        it('shows the activity pause on --dry-run without calling the API', async () => {
            const spy = captureConsole('log')
            await run('set', 'Away', '--pause-activity', '--dry-run')
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            expect(logged(spy)).toContain('Pause activity: yes')
        })

        it('describes --pause-activity as protecting Karma and streaks, apart from notifications', () => {
            const program = createTestProgram(registerStatusCommand)
            const set = program.commands
                .find((c) => c.name() === 'status')
                ?.commands.find((c) => c.name() === 'set')
            const help = set?.helpInformation() ?? ''
            expect(help).toContain('--pause-activity')
            expect(help).toContain('Karma')
            expect(help).toContain('streaks')
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
            ).rejects.toMatchObject({
                code: 'CONFLICTING_OPTIONS',
                message: 'Cannot use --until and --for together',
            })
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
        })

        it.each([
            ['--until', 'next week', 'INVALID_DATE'],
            ['--for', 'soon', 'INVALID_DURATION'],
            ['--for', '0m', 'INVALID_DURATION'],
            ['--until', '', 'INVALID_DATE'],
            ['--for', '', 'INVALID_DURATION'],
        ])(
            'rejects an invalid %s %j with %s instead of setting no expiry',
            async (flag, value, code) => {
                await expect(run('set', 'Focus', flag, value)).rejects.toMatchObject({
                    code,
                    message: expect.stringMatching(/Invalid --/),
                })
                expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            },
        )

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

        it('prints a preview envelope on --dry-run --json and sends nothing', async () => {
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
                '--json',
            )
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            expect(JSON.parse(logged(spy))).toEqual({
                status: 'preview',
                command: 'td status set',
                args: {
                    message: 'Focus',
                    emoji: '🎯',
                    activeUntil: '2026-10-20T09:00:00.000Z',
                    effects: { pauseNotifications: { scope: { mode: 'all' } } },
                },
            })
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
        afterEach(() => {
            resetGlobalArgs()
        })

        it('stops with usage instead of setting anything', async () => {
            captureConsole('log')
            captureConsole('error')
            await expect(run('set')).rejects.toMatchObject({ code: 'commander.help' })
            expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
        })

        it('reports MISSING_ARGUMENT under --json', async () => {
            const originalArgv = process.argv
            process.argv = ['node', 'td', 'status', 'set', '--json']
            resetGlobalArgs()
            try {
                captureConsole('log')
                await expect(run('set', '--json')).rejects.toMatchObject({
                    code: 'MISSING_ARGUMENT',
                })
                expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            } finally {
                process.argv = originalArgv
            }
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
        const badInputs: Array<[string, string[], string]> = [
            ['an empty message', [''], 'INVALID_OPTIONS'],
            ['a blank message', ['   '], 'INVALID_OPTIONS'],
            ['an 81 character message', ['x'.repeat(81)], 'INVALID_OPTIONS'],
            ['81 emoji', ['🎯'.repeat(81)], 'INVALID_OPTIONS'],
            ['an empty emoji', ['ok', '--emoji', ''], 'INVALID_OPTIONS'],
            ['a blank emoji', ['ok', '--emoji', '  '], 'INVALID_OPTIONS'],
            [
                'an emoji that is really the next flag',
                ['ok', '--emoji', '--pause-notifications'],
                'INVALID_OPTIONS',
            ],
            ['an impossible date', ['ok', '--until', '2026-02-30'], 'INVALID_DATE'],
            ['an impossible datetime', ['ok', '--until', '2026-02-31T10:00'], 'INVALID_DATE'],
            ['a month 13', ['ok', '--until', '2026-13-45'], 'INVALID_DATE'],
            ['a year only', ['ok', '--until', '2026'], 'INVALID_DATE'],
            [
                'today, which is already midnight past',
                ['ok', '--until', '2026-10-14'],
                'INVALID_DATE',
            ],
            ['a past datetime', ['ok', '--until', '2020-01-01T00:00:00Z'], 'INVALID_DATE'],
            ['an expiry equal to now', ['ok', '--until', '2026-10-14T12:00:00Z'], 'INVALID_DATE'],
            [
                'a duration that overflows to Infinity',
                ['ok', '--for', `${'9'.repeat(400)}m`],
                'INVALID_DURATION',
            ],
            [
                'a duration beyond the Date range',
                ['ok', '--for', '99999999999999d'],
                'INVALID_DURATION',
            ],
        ]

        it.each(badInputs)(
            'refuses %s with %s, with and without --dry-run',
            async (_name, args, code) => {
                for (const extra of [[], ['--dry-run']]) {
                    captureConsole('log')
                    await expect(run('set', ...args, ...extra)).rejects.toMatchObject({ code })
                }
                expect(apiMocks.writeUserStatus).not.toHaveBeenCalled()
            },
        )

        it('names the flag that was read as the emoji', async () => {
            captureConsole('log')
            const error = await run('set', 'ok', '--emoji', '--pause-notifications').catch((e) => e)
            expect(error.code).toBe('INVALID_OPTIONS')
            expect(error.message).toContain('--emoji needs an emoji, got --pause-notifications')
            expect(error.hints.join(' ')).toContain('read as its value')
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
            [
                'activity pause',
                { message: 'Away', effects: { pauseActivity: { scope: { mode: 'all' } } } },
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

        it('set fails when the server drops the activity pause that was sent', async () => {
            apiMocks.writeUserStatus.mockResolvedValue({ message: 'Away', effects: {} })
            captureConsole('log')
            await expect(run('set', 'Away', '--pause-activity')).rejects.toMatchObject({
                code: 'INVALID_STATE',
            })
        })

        it('names the status Todoist returned instead of the one sent', async () => {
            apiMocks.writeUserStatus.mockResolvedValue({ message: 'Someone else', effects: {} })
            captureConsole('log')
            await expect(run('set', 'Away')).rejects.toMatchObject({
                message: expect.stringContaining('Someone else'),
            })
        })

        it.each([
            ['an unrequested pauseActivity', { pauseActivity: { scope: { mode: 'all' } } }, []],
            [
                'pauseActivity added to the requested pause',
                {
                    pauseNotifications: { scope: { mode: 'all' } },
                    pauseActivity: { scope: { mode: 'all' } },
                },
                ['--pause-notifications'],
            ],
            [
                'a different notification scope',
                { pauseNotifications: { scope: { mode: 'mentions' } } },
                ['--pause-notifications'],
            ],
            [
                'a notification pause with no scope',
                { pauseNotifications: {} },
                ['--pause-notifications'],
            ],
        ])('set fails when the server returns %s', async (_name, effects, flags) => {
            apiMocks.writeUserStatus.mockResolvedValue({ message: 'Away', effects })
            captureConsole('log')
            await expect(run('set', 'Away', ...flags)).rejects.toMatchObject({
                code: 'INVALID_STATE',
            })
        })

        const FULL = {
            message: 'Away',
            emoji: '🎯',
            activeUntil: new Date('2030-01-01T00:00:00Z'),
            effects: { pauseNotifications: { scope: { mode: 'all' } } },
        }

        it.each(['emoji', 'activeUntil', 'effects'] as const)(
            'set fails when the server drops the %s that was sent',
            async (field) => {
                const { [field]: _dropped, ...returned } = FULL
                apiMocks.writeUserStatus.mockResolvedValue({ effects: {}, ...returned })
                captureConsole('log')
                await expect(
                    run(
                        'set',
                        'Away',
                        '--emoji',
                        '🎯',
                        '--until',
                        '2030-01-01T00:00:00Z',
                        '--pause-notifications',
                    ),
                ).rejects.toMatchObject({ code: 'INVALID_STATE' })
            },
        )

        it.each([
            ['floors', (ms: number) => Math.floor(ms / 1000) * 1000],
            ['rounds', (ms: number) => Math.round(ms / 1000) * 1000],
        ])('set accepts an expiry the server %s to whole seconds', async (_how, store) => {
            vi.setSystemTime(new Date('2026-10-14T12:00:00.623Z'))
            apiMocks.writeUserStatus.mockImplementation(async (sent) => ({
                message: sent.message,
                activeUntil: new Date(store(new Date(sent.activeUntil).getTime())),
                effects: {},
            }))
            const spy = captureConsole('log')
            await run('set', 'Away', '--for', '2h')
            expect(logged(spy)).toContain('Status set: Away')
        })

        it('set fails when the returned expiry is an hour off, not just rounded', async () => {
            apiMocks.writeUserStatus.mockImplementation(async (sent) => ({
                message: sent.message,
                activeUntil: new Date(new Date(sent.activeUntil).getTime() + 3_600_000),
                effects: {},
            }))
            captureConsole('log')
            await expect(run('set', 'Away', '--for', '2h')).rejects.toMatchObject({
                code: 'INVALID_STATE',
            })
        })

        it('treats an empty-string emoji from the server as no emoji', async () => {
            apiMocks.writeUserStatus.mockResolvedValue({ message: 'Away', emoji: '', effects: {} })
            const spy = captureConsole('log')
            await run('set', 'Away')
            expect(logged(spy)).toContain('Status set: Away')
        })

        it('succeeds, with one line each, when set and clear do what was asked', async () => {
            const spy = captureConsole('log')
            await run('set', 'Away')
            await run('clear')
            expect(logged(spy)).toBe('Status set: Away\nStatus cleared.')
        })
    })
})

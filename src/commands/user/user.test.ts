import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        readConfig: vi.fn(),
        resolveActiveUser: vi.fn(),
    }
})

const setDefaultMock = vi.fn()
const listMock = vi.fn()
const clearMock = vi.fn()
const lastClearMock = vi.fn<() => unknown>()
vi.mock('../../lib/auth-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth-store.js')>()
    return {
        ...actual,
        createTodoistTokenStore: () => ({
            active: vi.fn(),
            list: listMock,
            set: vi.fn(),
            setDefault: setDefaultMock,
            clear: clearMock,
            getLastStorageResult: vi.fn(),
            getLastClearResult: lastClearMock,
        }),
    }
})

vi.mock('chalk')

import { readConfig, resolveActiveUser } from '../../lib/auth.js'
import { mockConsoleError, mockConsoleLog } from '../../test-support/console-spy.js'
import { createTestProgram } from '../../test-support/program.js'
import { registerUserCommand } from './index.js'

const mockReadConfig = vi.mocked(readConfig)
const mockResolveActiveUser = vi.mocked(resolveActiveUser)

function createProgram() {
    return createTestProgram(registerUserCommand)
}

describe('user command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = mockConsoleLog()
        mockConsoleError()
        mockReadConfig.mockResolvedValue({})
    })

    describe('list', () => {
        beforeEach(() => {
            listMock.mockReset().mockResolvedValue([])
        })

        it.each([['user'], ['users']])(
            'is reachable via the back-compat `%s` alias',
            async (alias) => {
                listMock.mockResolvedValue([
                    { account: { id: '1', email: 'a@b.c' }, isDefault: true },
                ])

                await createProgram().parseAsync(['node', 'td', alias, 'list'])

                expect(consoleSpy.mock.calls.flat().join('\n')).toContain('a@b.c')
            },
        )

        describe('empty machine output', () => {
            it('emits an empty {accounts, default} envelope for --json', async () => {
                await createProgram().parseAsync(['node', 'td', 'accounts', 'list', '--json'])

                const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string)
                expect(payload).toEqual({ accounts: [], default: null })
            })

            it('emits nothing for --ndjson', async () => {
                await createProgram().parseAsync(['node', 'td', 'accounts', 'list', '--ndjson'])

                expect(consoleSpy).not.toHaveBeenCalled()
            })

            it('prints the empty-state message in human mode', async () => {
                await createProgram().parseAsync(['node', 'td', 'accounts', 'list'])

                expect(consoleSpy.mock.calls.flat().join('\n')).toMatch(
                    /No stored Todoist accounts/,
                )
            })
        })

        it('marks the default user', async () => {
            listMock.mockResolvedValue([
                { account: { id: '1', email: 'a@b.c' }, isDefault: false },
                { account: { id: '2', email: 'd@e.f' }, isDefault: true },
            ])

            await createProgram().parseAsync(['node', 'td', 'accounts', 'list'])

            const lines = consoleSpy.mock.calls.flat().join('\n')
            expect(lines).toContain('a@b.c')
            expect(lines).toContain('d@e.f')
            expect(lines).toContain('default')
        })

        it('streams one JSON value per console.log for --ndjson with stored accounts', async () => {
            listMock.mockResolvedValue([
                { account: { id: '1', email: 'a@b.c', auth_mode: 'read-write' }, isDefault: false },
                { account: { id: '2', email: 'd@e.f', auth_mode: 'read-only' }, isDefault: true },
            ])

            await createProgram().parseAsync(['node', 'td', 'accounts', 'list', '--ndjson'])

            expect(consoleSpy).toHaveBeenCalledTimes(2)
            const first = JSON.parse(consoleSpy.mock.calls[0][0] as string)
            const second = JSON.parse(consoleSpy.mock.calls[1][0] as string)
            expect(first).toMatchObject({ id: '1', email: 'a@b.c', isDefault: false })
            expect(second).toMatchObject({ id: '2', email: 'd@e.f', isDefault: true })
        })

        it('outputs a {accounts, default} envelope when --json given', async () => {
            listMock.mockResolvedValue([
                { account: { id: '1', email: 'a@b.c', auth_mode: 'read-write' }, isDefault: true },
            ])

            await createProgram().parseAsync(['node', 'td', 'accounts', 'list', '--json'])

            const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string)
            expect(payload).toEqual({
                accounts: [
                    {
                        id: '1',
                        email: 'a@b.c',
                        isDefault: true,
                        authMode: 'read-write',
                    },
                ],
                default: '1',
            })
        })
    })

    describe('use', () => {
        beforeEach(() => {
            setDefaultMock.mockReset().mockResolvedValue(undefined)
            // The attacher re-reads `store.list()` after `setDefault` to
            // resolve the canonical default id for `--json` output.
            listMock.mockReset().mockResolvedValue([])
        })

        it('sets the default user by id', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'use', '111'])

            expect(setDefaultMock).toHaveBeenCalledWith('111')
        })

        it('rejects an unknown ref', async () => {
            // `td user use` routes directly through `store.setDefault(ref)`
            // now; cli-core's `KeyringTokenStore` throws
            // `CliError('ACCOUNT_NOT_FOUND', …)` on miss — the test stub
            // mirrors that contract so the command propagates correctly.
            const { CliError } = await import('../../lib/errors.js')
            setDefaultMock.mockRejectedValueOnce(
                new CliError('ACCOUNT_NOT_FOUND', 'No stored account matches "nope".'),
            )

            await expect(
                createProgram().parseAsync(['node', 'td', 'accounts', 'use', 'nope']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')
        })

        it('default subcommand is an alias of use', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'default', '111'])

            expect(setDefaultMock).toHaveBeenCalledWith('111')
        })
    })

    describe('current', () => {
        it('prints the active user', async () => {
            mockResolveActiveUser.mockResolvedValue({
                id: '111',
                email: 'a@b.c',
                token: 't',
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                user: { defaultUser: '111' },
                users: [],
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current'])

            const out = consoleSpy.mock.calls.flat().join('\n')
            expect(out).toContain('a@b.c')
            expect(out).toContain('default')
        })

        it('says env when running on TODOIST_API_TOKEN', async () => {
            mockResolveActiveUser.mockResolvedValue({
                id: 'env',
                email: '',
                token: 'envtoken',
                authMode: 'unknown',
                source: 'env',
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current'])

            const out = consoleSpy.mock.calls.flat().join('\n')
            expect(out).toContain('TODOIST_API_TOKEN')
        })
    })

    describe('remove', () => {
        beforeEach(() => {
            clearMock.mockReset().mockResolvedValue(undefined)
            lastClearMock.mockReset().mockReturnValue({ storage: 'secure-store' })
        })

        it('removes the user by id and clears default', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                user: { defaultUser: '111' },
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'remove', '111'])

            expect(clearMock).toHaveBeenCalledWith('111')
            expect(consoleSpy.mock.calls.flat().join('\n')).toContain('Cleared default')
        })

        it('rejects an unknown ref', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await expect(
                createProgram().parseAsync(['node', 'td', 'accounts', 'remove', 'nope']),
            ).rejects.toHaveProperty('code', 'USER_NOT_FOUND')
            expect(clearMock).not.toHaveBeenCalled()
        })
    })
})

import { describeEmptyMachineOutput } from '@doist/cli-core/testing'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        listStoredUsers: vi.fn(),
        readConfig: vi.fn(),
        resolveActiveUser: vi.fn(),
    }
})

const setDefaultMock = vi.fn()
const clearMock = vi.fn()
const lastClearMock = vi.fn<() => unknown>()
vi.mock('../../lib/auth-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth-store.js')>()
    return {
        ...actual,
        createTodoistTokenStore: () => ({
            active: vi.fn(),
            list: vi.fn().mockResolvedValue([]),
            set: vi.fn(),
            setDefault: setDefaultMock,
            clear: clearMock,
            getLastStorageResult: vi.fn(),
            getLastClearResult: lastClearMock,
        }),
    }
})

vi.mock('chalk')

import { listStoredUsers, readConfig, resolveActiveUser } from '../../lib/auth.js'
import { registerUserCommand } from './index.js'

const mockListStoredUsers = vi.mocked(listStoredUsers)
const mockReadConfig = vi.mocked(readConfig)
const mockResolveActiveUser = vi.mocked(resolveActiveUser)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerUserCommand(program)
    return program
}

describe('user command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockReadConfig.mockResolvedValue({})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
    })

    describe('list', () => {
        describeEmptyMachineOutput('empty machine output contract', {
            setup: () => {
                mockListStoredUsers.mockResolvedValue([])
            },
            run: async (extraArgs) => {
                await createProgram().parseAsync(['node', 'td', 'user', 'list', ...extraArgs])
            },
            humanMessage: /No stored Todoist accounts/,
        })

        it('marks the default user', async () => {
            mockListStoredUsers.mockResolvedValue([
                { id: '1', email: 'a@b.c' },
                { id: '2', email: 'd@e.f' },
            ])
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                user: { defaultUser: '2' },
                users: [],
            })

            await createProgram().parseAsync(['node', 'td', 'user', 'list'])

            const lines = consoleSpy.mock.calls.flat().join('\n')
            expect(lines).toContain('a@b.c')
            expect(lines).toContain('d@e.f')
            expect(lines).toContain('default')
        })

        it('emits one JSON value per line for --ndjson with stored accounts', async () => {
            mockListStoredUsers.mockResolvedValue([
                { id: '1', email: 'a@b.c', auth_mode: 'read-write' },
                { id: '2', email: 'd@e.f', auth_mode: 'read-only' },
            ])
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                user: { defaultUser: '2' },
                users: [],
            })

            await createProgram().parseAsync(['node', 'td', 'user', 'list', '--ndjson'])

            const output = consoleSpy.mock.calls[0][0] as string
            const lines = output.split('\n')
            expect(lines).toHaveLength(2)
            const first = JSON.parse(lines[0])
            const second = JSON.parse(lines[1])
            expect(first).toMatchObject({ id: '1', email: 'a@b.c', isDefault: false })
            expect(second).toMatchObject({ id: '2', email: 'd@e.f', isDefault: true })
            expect(output.endsWith('\n')).toBe(false) // no trailing newline within payload
        })

        it('outputs JSON when --json given', async () => {
            mockListStoredUsers.mockResolvedValue([
                { id: '1', email: 'a@b.c', auth_mode: 'read-write' },
            ])
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                user: { defaultUser: '1' },
                users: [],
            })

            await createProgram().parseAsync(['node', 'td', 'user', 'list', '--json'])

            const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string)
            expect(payload).toEqual([
                {
                    id: '1',
                    email: 'a@b.c',
                    isDefault: true,
                    authMode: 'read-write',
                    authScope: undefined,
                    authFlags: undefined,
                    storage: 'secure-store',
                },
            ])
        })
    })

    describe('use', () => {
        beforeEach(() => {
            setDefaultMock.mockReset().mockResolvedValue(undefined)
        })

        it('sets the default user by id', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'td', 'user', 'use', '111'])

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
                createProgram().parseAsync(['node', 'td', 'user', 'use', 'nope']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')
        })

        it('default subcommand is an alias of use', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'td', 'user', 'default', '111'])

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

            await createProgram().parseAsync(['node', 'td', 'user', 'current'])

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

            await createProgram().parseAsync(['node', 'td', 'user', 'current'])

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

            await createProgram().parseAsync(['node', 'td', 'user', 'remove', '111'])

            expect(clearMock).toHaveBeenCalledWith('111')
            expect(consoleSpy.mock.calls.flat().join('\n')).toContain('Cleared default')
        })

        it('rejects an unknown ref', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await expect(
                createProgram().parseAsync(['node', 'td', 'user', 'remove', 'nope']),
            ).rejects.toHaveProperty('code', 'USER_NOT_FOUND')
            expect(clearMock).not.toHaveBeenCalled()
        })
    })
})

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
const activeAccountMock = vi.fn()
const lastClearMock = vi.fn<() => unknown>()
vi.mock('../../lib/auth-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth-store.js')>()
    return {
        ...actual,
        createTodoistTokenStore: () => ({
            active: vi.fn(),
            activeAccount: activeAccountMock,
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

        it('streams one JSON value per line for --ndjson with stored accounts', async () => {
            listMock.mockResolvedValue([
                { account: { id: '1', email: 'a@b.c', auth_mode: 'read-write' }, isDefault: false },
                { account: { id: '2', email: 'd@e.f', auth_mode: 'read-only' }, isDefault: true },
            ])

            await createProgram().parseAsync(['node', 'td', 'accounts', 'list', '--ndjson'])

            const lines = (consoleSpy.mock.calls.flat().join('\n') as string)
                .split('\n')
                .filter((line) => line.length > 0)
            expect(lines).toHaveLength(2)
            expect(JSON.parse(lines[0]!)).toMatchObject({
                id: '1',
                email: 'a@b.c',
                isDefault: false,
            })
            expect(JSON.parse(lines[1]!)).toMatchObject({
                id: '2',
                email: 'd@e.f',
                isDefault: true,
            })
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
            // `td accounts use` routes directly through `store.setDefault(ref)`
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

        it('emits {ok, default} for --json, resolving the canonical default id', async () => {
            // After setDefault the attacher re-reads list() to surface the
            // account's canonical id as `default`.
            listMock.mockResolvedValue([
                { account: { id: '111', email: 'a@b.c' }, isDefault: true },
            ])

            await createProgram().parseAsync(['node', 'td', 'accounts', 'use', 'a@b.c', '--json'])

            expect(setDefaultMock).toHaveBeenCalledWith('a@b.c')
            const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string)
            expect(payload).toEqual({ ok: true, default: '111' })
        })

        it('is silent for --ndjson (success-action convention)', async () => {
            listMock.mockResolvedValue([
                { account: { id: '111', email: 'a@b.c' }, isDefault: true },
            ])

            await createProgram().parseAsync(['node', 'td', 'accounts', 'use', '111', '--ndjson'])

            expect(setDefaultMock).toHaveBeenCalledWith('111')
            expect(consoleSpy).not.toHaveBeenCalled()
        })
    })

    describe('current', () => {
        beforeEach(() => {
            // Default: store resolves nothing, so tests opt into a stored
            // account explicitly and the env/legacy cases fall through to the
            // `onNotAuthenticated` resolver.
            activeAccountMock.mockReset().mockResolvedValue(null)
        })

        it('prints the active stored account with its default marker', async () => {
            activeAccountMock.mockResolvedValue({
                account: { id: '111', email: 'a@b.c', auth_mode: 'read-write' },
                isDefault: true,
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current'])

            const out = consoleSpy.mock.calls.flat().join('\n')
            expect(out).toContain('a@b.c')
            expect(out).toContain('default')
        })

        it('emits the stored account shape for --json', async () => {
            activeAccountMock.mockResolvedValue({
                account: { id: '111', email: 'a@b.c', auth_mode: 'read-write' },
                isDefault: true,
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current', '--json'])

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toMatchObject({
                id: '111',
                email: 'a@b.c',
                source: 'secure-store',
                isDefault: true,
                authMode: 'read-write',
            })
        })

        it('reports the account source annotated by the store (config-file fallback)', async () => {
            // The adapter's `activeAccount` annotates the resolved account with
            // its real token source; `current --json` surfaces it verbatim.
            activeAccountMock.mockResolvedValue({
                account: { id: '111', email: 'a@b.c', source: 'config-file' },
                isDefault: true,
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current', '--json'])

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toMatchObject({
                source: 'config-file',
            })
        })

        it('says env when running on TODOIST_API_TOKEN', async () => {
            // env short-circuits `activeAccount` (-> null), so `current` falls
            // through to the resolver, which reports the env source.
            mockResolveActiveUser.mockResolvedValue({
                id: 'env',
                email: '',
                token: 'envtoken',
                authMode: 'unknown',
                source: 'env',
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current'])

            expect(consoleSpy.mock.calls.flat().join('\n')).toContain('TODOIST_API_TOKEN')
        })

        it('reports legacy single-user credentials', async () => {
            mockResolveActiveUser.mockResolvedValue({
                id: 'legacy',
                email: 'old@e.f',
                token: 'legacytoken',
                authMode: 'unknown',
                source: 'config-file',
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current'])

            expect(consoleSpy.mock.calls.flat().join('\n')).toContain('legacy')
        })

        it('emits one ndjson line for the env fallback', async () => {
            // The onNotAuthenticated branch formats NDJSON itself for
            // out-of-store sources.
            mockResolveActiveUser.mockResolvedValue({
                id: 'env',
                email: '',
                token: 'envtoken',
                authMode: 'unknown',
                source: 'env',
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'current', '--ndjson'])

            expect(consoleSpy).toHaveBeenCalledTimes(1)
            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toMatchObject({
                id: null,
                source: 'env',
                isDefault: false,
            })
        })
    })

    describe('remove', () => {
        beforeEach(() => {
            clearMock.mockReset()
            lastClearMock.mockReset().mockReturnValue({ storage: 'secure-store' })
        })

        it('removes the resolved account and notes the cleared default', async () => {
            // The store resolves the ref, clears by canonical id, and reports
            // whether it was the default.
            clearMock.mockResolvedValue({
                account: { id: '111', email: 'a@b.c' },
                wasDefault: true,
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'remove', 'a@b.c'])

            expect(clearMock).toHaveBeenCalledWith('a@b.c')
            const out = consoleSpy.mock.calls.flat().join('\n')
            expect(out).toContain('Removed a@b.c')
            expect(out).toContain('Cleared default')
        })

        it('rejects an unknown ref', async () => {
            // A `null` return from `clear()` means the ref matched nothing.
            clearMock.mockResolvedValue(null)

            await expect(
                createProgram().parseAsync(['node', 'td', 'accounts', 'remove', 'nope']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')
        })

        it('surfaces a keyring-fallback warning to stderr', async () => {
            clearMock.mockResolvedValue({
                account: { id: '111', email: 'a@b.c' },
                wasDefault: false,
            })
            lastClearMock.mockReturnValue({
                storage: 'config-file',
                warning: 'Keyring unavailable; removed plaintext token instead.',
            })
            const errorSpy = mockConsoleError()

            await createProgram().parseAsync(['node', 'td', 'accounts', 'remove', '111'])

            expect(errorSpy.mock.calls.flat().join('\n')).toContain('Keyring unavailable')
        })

        it('emits { ok, removed } for --json', async () => {
            clearMock.mockResolvedValue({
                account: { id: '111', email: 'a@b.c' },
                wasDefault: false,
            })

            await createProgram().parseAsync(['node', 'td', 'accounts', 'remove', '111', '--json'])

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
                ok: true,
                removed: '111',
            })
        })

        it('is silent on stdout for --ndjson', async () => {
            clearMock.mockResolvedValue({
                account: { id: '111', email: 'a@b.c' },
                wasDefault: false,
            })

            await createProgram().parseAsync([
                'node',
                'td',
                'accounts',
                'remove',
                '111',
                '--ndjson',
            ])

            expect(consoleSpy).not.toHaveBeenCalled()
        })
    })
})

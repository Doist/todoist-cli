import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        listStoredUsers: vi.fn(),
        readConfig: vi.fn(),
        setDefaultUserId: vi.fn(),
        removeUserById: vi.fn(),
        resolveActiveUser: vi.fn(),
    }
})

vi.mock('chalk')

import {
    listStoredUsers,
    readConfig,
    removeUserById,
    resolveActiveUser,
    setDefaultUserId,
} from '../../lib/auth.js'
import { registerUserCommand } from './index.js'

const mockListStoredUsers = vi.mocked(listStoredUsers)
const mockReadConfig = vi.mocked(readConfig)
const mockSetDefaultUserId = vi.mocked(setDefaultUserId)
const mockRemoveUserById = vi.mocked(removeUserById)
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
        it('prints a hint when no users are stored', async () => {
            mockListStoredUsers.mockResolvedValue([])
            await createProgram().parseAsync(['node', 'td', 'user', 'list'])

            expect(consoleSpy.mock.calls.flat().join('\n')).toContain('No stored Todoist accounts')
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
        it('sets the default user by id', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'td', 'user', 'use', '111'])

            expect(mockSetDefaultUserId).toHaveBeenCalledWith('111')
        })

        it('rejects an unknown ref', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await expect(
                createProgram().parseAsync(['node', 'td', 'user', 'use', 'nope']),
            ).rejects.toHaveProperty('code', 'USER_NOT_FOUND')
        })

        it('default subcommand is an alias of use', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                users: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'td', 'user', 'default', '111'])

            expect(mockSetDefaultUserId).toHaveBeenCalledWith('111')
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
        it('removes the user by id and clears default', async () => {
            mockReadConfig.mockResolvedValue({
                config_version: 2,
                user: { defaultUser: '111' },
                users: [{ id: '111', email: 'a@b.c' }],
            })
            mockRemoveUserById.mockResolvedValue({ storage: 'secure-store' })

            await createProgram().parseAsync(['node', 'td', 'user', 'remove', '111'])

            expect(mockRemoveUserById).toHaveBeenCalledWith('111')
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
            expect(mockRemoveUserById).not.toHaveBeenCalled()
        })
    })
})

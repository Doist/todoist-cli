import fs from 'node:fs'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/auth.js', () => ({
    getAuthMetadata: vi.fn(),
}))

import { registerBackupCommand } from '../commands/backup/index.js'
import { getApi } from '../lib/api/core.js'
import { getAuthMetadata } from '../lib/auth.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)
const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerBackupCommand(program)
    return program
}

describe('backup list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            authScope: 'data:read_write,data:delete,project:delete,backups:read',
            source: 'secure-store',
        })
    })

    it('lists available backups', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getBackups.mockResolvedValue([
            { version: '2024-01-15_12:00', url: 'https://example.com/backup1.zip' },
            { version: '2024-01-14_12:00', url: 'https://example.com/backup2.zip' },
        ])

        await program.parseAsync(['node', 'td', 'backup', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2024-01-15_12:00'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2024-01-14_12:00'))
        consoleSpy.mockRestore()
    })

    it('shows "No backups found." when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getBackups.mockResolvedValue([])

        await program.parseAsync(['node', 'td', 'backup', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No backups found.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getBackups.mockResolvedValue([
            { version: '2024-01-15_12:00', url: 'https://example.com/backup1.zip' },
        ])

        await program.parseAsync(['node', 'td', 'backup', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toHaveLength(1)
        expect(parsed.results[0].version).toBe('2024-01-15_12:00')
        expect(parsed.nextCursor).toBeNull()
        consoleSpy.mockRestore()
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getBackups.mockResolvedValue([
            { version: '2024-01-15_12:00', url: 'https://example.com/backup1.zip' },
            { version: '2024-01-14_12:00', url: 'https://example.com/backup2.zip' },
        ])

        await program.parseAsync(['node', 'td', 'backup', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
        const line1 = JSON.parse(lines[0])
        expect(line1.version).toBe('2024-01-15_12:00')
        consoleSpy.mockRestore()
    })

    it('throws error when token is missing backups:read scope', async () => {
        const program = createProgram()

        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            authScope: 'data:read_write,data:delete,project:delete',
            source: 'secure-store',
        })

        await expect(program.parseAsync(['node', 'td', 'backup', 'list'])).rejects.toThrow(
            'missing the backups:read scope',
        )
    })

    it('suggests `td auth login --additional-scopes=backups` when no prior flags were recorded', async () => {
        const program = createProgram()

        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            authScope: 'data:read_write,data:delete,project:delete',
            source: 'secure-store',
        })

        await expect(program.parseAsync(['node', 'td', 'backup', 'list'])).rejects.toMatchObject({
            hints: [
                'Re-authenticate to grant backup access: td auth login --additional-scopes=backups',
            ],
        })
    })

    it('preserves prior --read-only flag in the suggested re-login command', async () => {
        const program = createProgram()

        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authScope: 'data:read',
            authFlags: ['read-only'],
            source: 'secure-store',
        })

        await expect(program.parseAsync(['node', 'td', 'backup', 'list'])).rejects.toMatchObject({
            hints: [
                'Re-authenticate to grant backup access: td auth login --read-only --additional-scopes=backups',
            ],
        })
    })

    it('preserves prior app-management scope in the suggested re-login command', async () => {
        const program = createProgram()

        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            authScope: 'data:read_write,data:delete,project:delete,dev:app_console',
            authFlags: ['app-management'],
            source: 'secure-store',
        })

        await expect(program.parseAsync(['node', 'td', 'backup', 'list'])).rejects.toMatchObject({
            hints: [
                'Re-authenticate to grant backup access: td auth login --additional-scopes=app-management,backups',
            ],
        })
    })
})

describe('backup download', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            authScope: 'data:read_write,data:delete,project:delete,backups:read',
            source: 'secure-store',
        })
    })

    it('downloads a backup to the specified output path', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

        mockApi.getBackups.mockResolvedValue([
            { version: '2024-01-15_12:00', url: 'https://example.com/backup1.zip' },
        ])
        mockApi.downloadBackup.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        })

        await program.parseAsync([
            'node',
            'td',
            'backup',
            'download',
            '2024-01-15_12:00',
            '--output-file',
            '/tmp/backup.zip',
        ])

        expect(mockApi.downloadBackup).toHaveBeenCalledWith({
            file: 'https://example.com/backup1.zip',
        })
        expect(writeSpy).toHaveBeenCalledWith('/tmp/backup.zip', expect.any(Buffer))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/tmp/backup.zip'))
        consoleSpy.mockRestore()
        writeSpy.mockRestore()
    })

    it('throws error when download response is not ok', async () => {
        const program = createProgram()

        mockApi.getBackups.mockResolvedValue([
            { version: '2024-01-15_12:00', url: 'https://example.com/backup1.zip' },
        ])
        mockApi.downloadBackup.mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'backup',
                'download',
                '2024-01-15_12:00',
                '--output-file',
                '/tmp/backup.zip',
            ]),
        ).rejects.toThrow('Failed to download backup: 404 Not Found')
    })

    it('errors when --output-file is not provided', async () => {
        const program = createProgram()
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(
            program.parseAsync(['node', 'td', 'backup', 'download', '2024-01-15_12:00']),
        ).rejects.toThrow()

        stderrSpy.mockRestore()
    })

    it('throws error when version is not found', async () => {
        const program = createProgram()

        mockApi.getBackups.mockResolvedValue([
            { version: '2024-01-15_12:00', url: 'https://example.com/backup1.zip' },
        ])

        await expect(
            program.parseAsync([
                'node',
                'td',
                'backup',
                'download',
                'nonexistent',
                '--output-file',
                '/tmp/backup.zip',
            ]),
        ).rejects.toThrow('Backup version "nonexistent" not found')
    })
})

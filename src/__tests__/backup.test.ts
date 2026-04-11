import fs from 'node:fs'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { registerBackupCommand } from '../commands/backup/index.js'
import { getApi } from '../lib/api/core.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)

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

        expect(consoleSpy).toHaveBeenCalledTimes(2)
        const line1 = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(line1._type).toBe('backup')
        expect(line1.version).toBe('2024-01-15_12:00')
        consoleSpy.mockRestore()
    })
})

describe('backup download', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('downloads a backup to the specified output path', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

        mockApi.getBackups.mockResolvedValue([
            { version: '2024-01-15_12:00', url: 'https://example.com/backup1.zip' },
        ])
        mockApi.downloadBackup.mockResolvedValue({
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

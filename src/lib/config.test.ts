import { describe, expect, it, vi } from 'vitest'

vi.mock('@doist/cli-core', async () => {
    const actual = await vi.importActual<typeof import('@doist/cli-core')>('@doist/cli-core')
    return {
        ...actual,
        getConfigPath: vi.fn(() => '/tmp/cli-core-test/config.json'),
        readConfigStrict: vi.fn(),
    }
})

import { readConfigStrict as readConfigStrictCore } from '@doist/cli-core'
import { readConfigStrict } from './config.js'

const mockReadConfigStrictCore = vi.mocked(readConfigStrictCore)

describe('readConfigStrict wrapper', () => {
    it('passes the missing state through unchanged', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({ state: 'missing' })
        await expect(readConfigStrict()).resolves.toEqual({ state: 'missing' })
    })

    it('passes the present state through with a Config-shaped cast', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'present',
            config: { config_version: 2, users: [] },
        })
        await expect(readConfigStrict()).resolves.toEqual({
            state: 'present',
            config: { config_version: 2, users: [] },
        })
    })

    it('translates read-failed to CONFIG_READ_FAILED with todoist hint copy', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'read-failed',
            error: new Error('EACCES: permission denied'),
        })
        await expect(readConfigStrict()).rejects.toMatchObject({
            code: 'CONFIG_READ_FAILED',
            message: expect.stringContaining('EACCES: permission denied'),
            hints: ['Check file permissions, or run `td doctor` to diagnose'],
        })
    })

    it('translates invalid-json to CONFIG_INVALID_JSON with re-auth hint', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'invalid-json',
            error: new SyntaxError('Unexpected token } in JSON at position 12'),
        })
        await expect(readConfigStrict()).rejects.toMatchObject({
            code: 'CONFIG_INVALID_JSON',
            message: expect.stringContaining('Unexpected token'),
            hints: [
                'Fix the JSON by hand, or delete the file and re-authenticate with `td auth login`',
            ],
        })
    })

    it('translates invalid-shape to CONFIG_INVALID_SHAPE and surfaces the actual type', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'invalid-shape',
            actual: 'array',
        })
        await expect(readConfigStrict()).rejects.toMatchObject({
            code: 'CONFIG_INVALID_SHAPE',
            message: expect.stringContaining('got array'),
            hints: [
                'Fix the JSON by hand, or delete the file and re-authenticate with `td auth login`',
            ],
        })
    })
})

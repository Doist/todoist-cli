import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth.js', () => ({
    getAuthMetadata: vi.fn(),
}))

import { getAuthMetadata } from '../lib/auth.js'
import {
    ensureWriteAllowed,
    isMutatingApiMethod,
    isMutatingSyncPayload,
    READ_ONLY_ERROR_MESSAGE,
} from '../lib/permissions.js'

const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

describe('permissions', () => {
    it('blocks writes in read-only mode', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authScope: 'data:read',
            source: 'config',
        })

        await expect(ensureWriteAllowed()).rejects.toThrow(READ_ONLY_ERROR_MESSAGE)
    })

    it('allows writes when mode is unknown', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'unknown',
            source: 'env',
        })

        await expect(ensureWriteAllowed()).resolves.toBeUndefined()
    })

    it('identifies mutating methods and sync payloads', () => {
        expect(isMutatingApiMethod('addTask')).toBe(true)
        expect(isMutatingApiMethod('getTasks')).toBe(false)
        expect(isMutatingApiMethod('brandNewApiMethod')).toBe(true)
        expect(isMutatingSyncPayload([{ commands: [{ type: 'task_add' }] }])).toBe(true)
        expect(isMutatingSyncPayload([{ resourceTypes: ['items'], syncToken: '*' }])).toBe(false)
    })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth.js', () => ({
    getAuthMetadata: vi.fn(),
}))

import { getAuthMetadata } from './auth.js'
import {
    READ_ONLY_ERROR_MESSAGE,
    clearPermissionsCache,
    ensureWriteAllowed,
    isMutatingApiMethod,
    isMutatingSyncPayload,
} from './permissions.js'

const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

describe('permissions', () => {
    beforeEach(() => {
        clearPermissionsCache()
        vi.clearAllMocks()
    })

    it('blocks writes in read-only mode', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authScope: 'data:read',
            source: 'secure-store',
        })

        await expect(ensureWriteAllowed()).rejects.toThrow(READ_ONLY_ERROR_MESSAGE)
    })

    it('allows writes in read-write mode', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            authScope: 'data:read_write,data:delete,project:delete',
            source: 'secure-store',
        })

        await expect(ensureWriteAllowed()).resolves.toBeUndefined()
    })

    it('allows writes when mode is unknown', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'unknown',
            source: 'env',
        })

        await expect(ensureWriteAllowed()).resolves.toBeUndefined()
    })

    it('caches auth metadata across calls', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            source: 'secure-store',
        })

        await ensureWriteAllowed()
        await ensureWriteAllowed()

        expect(mockGetAuthMetadata).toHaveBeenCalledTimes(1)
    })

    it('identifies mutating API methods', () => {
        expect(isMutatingApiMethod('addTask')).toBe(true)
        expect(isMutatingApiMethod('updateTask')).toBe(true)
        expect(isMutatingApiMethod('deleteTask')).toBe(true)
        expect(isMutatingApiMethod('closeTask')).toBe(true)
        expect(isMutatingApiMethod('addProject')).toBe(true)
        expect(isMutatingApiMethod('archiveProject')).toBe(true)
    })

    it('identifies read-only API methods', () => {
        expect(isMutatingApiMethod('getTasks')).toBe(false)
        expect(isMutatingApiMethod('getTask')).toBe(false)
        expect(isMutatingApiMethod('getProjects')).toBe(false)
        expect(isMutatingApiMethod('getUser')).toBe(false)
        expect(isMutatingApiMethod('getLabels')).toBe(false)
        expect(isMutatingApiMethod('getSections')).toBe(false)
        expect(isMutatingApiMethod('getComments')).toBe(false)
        expect(isMutatingApiMethod('viewAttachment')).toBe(false)
        expect(isMutatingApiMethod('exportTemplateAsFile')).toBe(false)
        expect(isMutatingApiMethod('getReminders')).toBe(false)
        expect(isMutatingApiMethod('getWorkspaceInsights')).toBe(false)
        expect(isMutatingApiMethod('getBackups')).toBe(false)
        expect(isMutatingApiMethod('downloadBackup')).toBe(false)
        expect(isMutatingApiMethod('sync')).toBe(false)
    })

    it('defaults to mutating for unknown methods', () => {
        expect(isMutatingApiMethod('brandNewApiMethod')).toBe(true)
    })

    it('exempts Object.prototype methods', () => {
        expect(isMutatingApiMethod('toString')).toBe(false)
        expect(isMutatingApiMethod('valueOf')).toBe(false)
        expect(isMutatingApiMethod('hasOwnProperty')).toBe(false)
    })

    it('detects mutating sync payloads', () => {
        expect(isMutatingSyncPayload([{ commands: [{ type: 'item_add' }] }])).toBe(true)
    })

    it('detects read-only sync payloads', () => {
        expect(isMutatingSyncPayload([{ resourceTypes: ['items'], syncToken: '*' }])).toBe(false)
    })

    it('treats empty args as non-mutating', () => {
        expect(isMutatingSyncPayload([])).toBe(false)
    })

    it('treats empty commands array as non-mutating', () => {
        expect(isMutatingSyncPayload([{ commands: [] }])).toBe(false)
    })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../auth.js')>()
    return {
        ...actual,
        getAuthMetadata: vi.fn(),
    }
})

import { TodoistRequestError } from '@doist/todoist-sdk'
import { getAuthMetadata } from '../auth.js'
import { CliError } from '../errors.js'
import { buildRescheduleDate, wrapApiError } from './core.js'

const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

describe('buildRescheduleDate', () => {
    it('returns date as-is when input is date-only and task has no datetime', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'Mar 15',
            isRecurring: false,
        })
        expect(result).toBe('2026-03-20')
    })

    it('preserves existing time when input is date-only and task has datetime', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00',
        })
        expect(result).toBe('2026-03-20T14:00:00')
    })

    it('preserves existing time with timezone suffix', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00Z',
        })
        expect(result).toBe('2026-03-20T14:00:00Z')
    })

    it('uses provided datetime when input includes time', () => {
        const result = buildRescheduleDate('2026-03-20T10:00:00', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00',
        })
        expect(result).toBe('2026-03-20T10:00:00')
    })

    it('uses provided datetime even when task has no existing time', () => {
        const result = buildRescheduleDate('2026-03-20T10:00:00', {
            date: '2026-03-15',
            string: 'Mar 15',
            isRecurring: false,
        })
        expect(result).toBe('2026-03-20T10:00:00')
    })
})

describe('wrapApiError → MISSING_SCOPE (billing)', () => {
    function scopeError() {
        return new TodoistRequestError('HTTP 403: Forbidden', 403, {
            error: 'Insufficient Token scope',
            error_tag: 'AUTH_INSUFFICIENT_TOKEN_SCOPE',
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAuthMetadata.mockResolvedValue({ authMode: 'read-write', source: 'secure-store' })
    })

    it('emits the billing hint (read_write scope) for billing read methods', async () => {
        for (const method of [
            'getSubscriptionInfo',
            'getProPlanDetails',
            'getPrices',
            'getPricing',
        ]) {
            const wrapped = (await wrapApiError(scopeError(), method)) as CliError
            expect(wrapped.code).toBe('MISSING_SCOPE')
            expect(wrapped.hints?.[0]).toContain('--additional-scopes=billing')
            expect(wrapped.hints?.[0]).toContain('billing:read_write')
        }
    })

    it('names billing:read and preserves --read-only for a read-only login', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authFlags: ['read-only'],
            source: 'secure-store',
        })
        const wrapped = (await wrapApiError(scopeError(), 'getSubscriptionInfo')) as CliError
        expect(wrapped.hints?.[0]).toContain('--read-only --additional-scopes=billing')
        expect(wrapped.hints?.[0]).toContain('billing:read')
        expect(wrapped.hints?.[0]).not.toContain('billing:read_write')
    })

    it('names billing:read for migrated read-only configs with no auth_flags', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authFlags: undefined,
            source: 'config-file',
        })
        const wrapped = (await wrapApiError(scopeError(), 'getSubscriptionInfo')) as CliError
        expect(wrapped.hints?.[0]).toContain('--read-only --additional-scopes=billing')
        expect(wrapped.hints?.[0]).toContain('billing:read')
        expect(wrapped.hints?.[0]).not.toContain('billing:read_write')
    })
})

describe('wrapApiError → API_ERROR', () => {
    it('surfaces a string error from the API response body', async () => {
        const wrapped = (await wrapApiError(
            new TodoistRequestError('HTTP 400: Bad Request', 400, {
                error: 'completion date range must not exceed 3 months',
            }),
        )) as CliError

        expect(wrapped.code).toBe('API_ERROR')
        expect(wrapped.message).toBe('completion date range must not exceed 3 months')
    })

    it('surfaces a plain-string API response body', async () => {
        const wrapped = (await wrapApiError(
            new TodoistRequestError(
                'HTTP 400: Bad Request',
                400,
                'completion date range must not exceed 3 months',
            ),
        )) as CliError

        expect(wrapped.code).toBe('API_ERROR')
        expect(wrapped.message).toBe('completion date range must not exceed 3 months')
    })

    it('falls back to the SDK error when the response has no string error', async () => {
        const wrapped = (await wrapApiError(
            new TodoistRequestError('HTTP 500: Internal Server Error', 500, {
                error: { message: 'unexpected shape' },
            }),
        )) as CliError

        expect(wrapped.code).toBe('API_ERROR')
        expect(wrapped.message).toBe('HTTP 500: Internal Server Error')
    })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../auth.js')>()
    return {
        ...actual,
        getAuthMetadata: vi.fn(),
    }
})

import { TodoistRequestError, TodoistSyncError } from '@todoist/sdk'
import { getAuthMetadata } from '../auth.js'
import { CliError, SyncCommandError } from '../errors.js'
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

    it('appends per-field validation errors to the generic message', async () => {
        const wrapped = (await wrapApiError(
            new TodoistRequestError('HTTP 400: Bad Request', 400, {
                error: 'Invalid argument value',
                error_extra: {
                    error_fields: [
                        {
                            field: 'icon_md',
                            error: 'Invalid image dimension (accept only 300px * 300px)',
                        },
                        { field: 'name', error: 'Too long' },
                        { error: 'No field name' },
                        { field: 'ignored', error: { nested: true } },
                    ],
                },
            }),
        )) as CliError

        expect(wrapped.code).toBe('API_ERROR')
        expect(wrapped.message).toBe(
            'Invalid argument value — icon_md: Invalid image dimension (accept only 300px * 300px); name: Too long; No field name',
        )
    })
})

describe('wrapApiError → PROJECT_LIMIT_REACHED', () => {
    it('maps the API project limit rejection to a limit error, not an auth error', async () => {
        const wrapped = (await wrapApiError(
            new TodoistRequestError('HTTP 403: Forbidden', 403, {
                error: 'Maximum number of projects exceeded',
                error_tag: 'MAX_PROJECTS_LIMIT_REACHED',
            }),
            'addProject',
        )) as CliError

        expect(wrapped.code).toBe('PROJECT_LIMIT_REACHED')
        expect(wrapped.hints?.[0]).toContain('Archive or delete a personal project')
    })
})

describe('wrapApiError → PREMIUM_REQUIRED', () => {
    it('maps a REST refusal tagged PREMIUM_ONLY to a plan error', async () => {
        const wrapped = (await wrapApiError(
            new TodoistRequestError('HTTP 403: Forbidden', 403, {
                error: 'Premium only feature',
                error_tag: 'PREMIUM_ONLY',
                error_extra: { explanation: 'Reminders are a premium only feature' },
            }),
        )) as CliError

        expect(wrapped.code).toBe('PREMIUM_REQUIRED')
        expect(wrapped.message).toBe('Premium only feature — Reminders are a premium only feature')
    })
})

describe('wrapApiError → Sync API failures', () => {
    it('keeps each command outcome and the created IDs alongside the usual error', async () => {
        const failure = {
            error: 'Invalid argument value',
            errorCode: 20,
            errorExtra: {},
            errorTag: 'INVALID_ARGUMENT_VALUE',
            httpCode: 400,
        }
        const syncError = new TodoistSyncError(failure, {
            syncStatus: { 'uuid-1': 'ok', 'uuid-2': failure },
            tempIdMapping: { 'temp-1': 'task-1' },
        })

        const wrapped = await wrapApiError(syncError, 'sync')

        expect(wrapped).toBeInstanceOf(SyncCommandError)
        const commandError = wrapped as SyncCommandError
        expect(commandError.code).toBe('API_ERROR')
        expect(commandError.message).toBe('Invalid argument value')
        expect(commandError.syncStatus).toEqual({ 'uuid-1': 'ok', 'uuid-2': failure })
        expect(commandError.tempIdMapping).toEqual({ 'temp-1': 'task-1' })
    })

    it('names a feature the plan lacks, not a token problem', async () => {
        const failure = {
            error: 'Premium only feature',
            errorCode: 32,
            errorExtra: { explanation: 'Calendar layout is a premium only feature' },
            errorTag: 'PREMIUM_ONLY',
            httpCode: 403,
        }
        const syncError = new TodoistSyncError(failure, {
            syncStatus: { 'uuid-1': 'ok', 'uuid-2': failure },
            tempIdMapping: {},
        })

        const wrapped = await wrapApiError(syncError, 'sync')

        expect(wrapped).toBeInstanceOf(SyncCommandError)
        expect(wrapped).toMatchObject({
            code: 'PREMIUM_REQUIRED',
            message: 'Premium only feature — Calendar layout is a premium only feature',
            hints: [expect.stringContaining('paid Todoist plan')],
        })
    })

    it("keeps the API's reason for a rejected value", async () => {
        const failure = {
            error: 'Invalid argument value',
            errorCode: 20,
            errorExtra: {
                argument: 'args',
                expected: "view_mode: Input should be 'LIST', 'BOARD', 'CALENDAR' or 'TABLE'",
            },
            errorTag: 'INVALID_ARGUMENT_VALUE',
            httpCode: 400,
        }
        const syncError = new TodoistSyncError(failure, {
            syncStatus: { 'uuid-1': failure },
            tempIdMapping: {},
        })

        const wrapped = await wrapApiError(syncError, 'sync')

        expect(wrapped).toMatchObject({
            code: 'API_ERROR',
            message:
                "Invalid argument value — view_mode: Input should be 'LIST', 'BOARD', 'CALENDAR' or 'TABLE'",
        })
    })

    it('leaves other request errors as a plain CliError', async () => {
        const wrapped = await wrapApiError(
            new TodoistRequestError('HTTP 400: Bad Request', 400, { error: 'Bad input' }),
        )

        expect(wrapped).toBeInstanceOf(CliError)
        expect(wrapped).not.toBeInstanceOf(SyncCommandError)
    })
})

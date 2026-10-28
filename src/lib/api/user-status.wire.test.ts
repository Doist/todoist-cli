import { type CustomFetch, TodoistApi } from '@doist/todoist-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./core.js', () => ({ getApi: vi.fn() }))

import { getApi } from './core.js'
import { fetchUserStatus, writeUserStatus } from './user-status.js'

// The other suite mocks `api.sync`, so it cannot see what the SDK puts on the wire. This one
// runs the real SDK and stubs only the transport.
const customFetch = vi.fn<CustomFetch>()

// The SDK validates the whole user resource, so the stub needs every required field.
function userWith(status: unknown) {
    return {
        id: '1',
        email: 'a@example.com',
        full_name: 'A',
        activated_user: true,
        auto_reminder: 0,
        business_account_id: null,
        daily_goal: 5,
        date_format: 0,
        days_off: [],
        feature_identifier: 'x',
        features: {
            karma_disabled: false,
            restriction: 3,
            karma_vacation: false,
            dateist_lang: null,
            beta: 0,
            has_push_reminders: true,
            dateist_inline_disabled: false,
        },
        has_magic_number: false,
        has_password: true,
        image_id: null,
        inbox_project_id: '2',
        is_celebrations_enabled: true,
        is_premium: false,
        joinable_workspace: null,
        joined_at: '2020-01-01T00:00:00Z',
        getting_started_guide_projects: null,
        karma: 0,
        karma_trend: 'none',
        lang: 'en',
        next_week: 1,
        premium_status: 'not_premium',
        premium_until: null,
        share_limit: 5,
        sort_order: 0,
        start_day: 1,
        start_page: 'today',
        theme_id: '0',
        time_format: 0,
        tz_info: { timezone: 'UTC', hours: 0, minutes: 0, is_dst: 0, gmt_string: '+00:00' },
        unique_prefix: 1,
        verification_status: 'verified',
        websocket_url: 'wss://example.com',
        weekend_start_day: 6,
        weekly_goal: 30,
        status,
    }
}

function reply(status: unknown) {
    const body = { user: userWith(status) }
    customFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        text: async () => JSON.stringify(body),
        json: async () => body,
    })
}

function sentBody(): Record<string, unknown> {
    const [, init] = customFetch.mock.calls[0]
    const body = init?.body
    if (typeof body !== 'string') throw new Error(`Unexpected request body: ${String(body)}`)
    return JSON.parse(body)
}

describe('user status over the real SDK', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getApi).mockResolvedValue(new TodoistApi('token', { customFetch }))
    })

    it('sends status: null to clear, and still reads null back', async () => {
        reply(null)

        expect(await writeUserStatus(null)).toBeNull()

        const [url] = customFetch.mock.calls[0]
        expect(url).toMatch(/\/sync$/)
        const body = sentBody()
        expect(body.resource_types).toEqual(['user'])
        const commands = body.commands as { type: string; args: unknown }[]
        expect(commands).toHaveLength(1)
        expect(commands[0].type).toBe('user_update')
        expect(commands[0].args).toStrictEqual({ status: null })
    })

    it.each([false, true])(
        'serializes status values and removals (clearing: %s)',
        async (clearing) => {
            const emoji = clearing ? null : '🎯'
            const expiry = clearing ? null : '2026-10-20T09:27:47.530Z'
            reply({
                message: 'Deep work',
                emoji,
                active_until: expiry,
                effects: clearing ? {} : { pause_notifications: { scope: { mode: 'all' } } },
            })

            const status = await writeUserStatus({
                message: 'Deep work',
                emoji,
                activeUntil: expiry ? new Date(expiry) : null,
                effects: { pauseNotifications: clearing ? null : {}, pauseActivity: null },
            })

            const commands = sentBody().commands as { args: { status: unknown } }[]
            expect(commands[0].args.status).toStrictEqual({
                message: 'Deep work',
                emoji,
                active_until: expiry,
                effects: { pause_notifications: clearing ? null : {}, pause_activity: null },
            })
            expect(status).toMatchObject({
                message: 'Deep work',
                emoji,
                activeUntil: expiry ? new Date(expiry) : null,
                effects: clearing ? {} : { pauseNotifications: { scope: { mode: 'all' } } },
            })
        },
    )

    it('reads the status from the user resource', async () => {
        reply({ message: 'Away', effects: {} })

        expect(await fetchUserStatus()).toMatchObject({ message: 'Away', effects: {} })
        expect(sentBody().resource_types).toEqual(['user'])
    })
})

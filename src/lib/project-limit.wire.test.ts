import { type CustomFetch, TodoistApi } from '@doist/todoist-sdk'
import { describe, expect, it } from 'vitest'
import { ensurePersonalProjectCapacity } from './project-limit.js'

// The command suites mock `getPersonalProjectCapacity`, so they cannot see the SDK validate a
// real plan-limits response. This one runs the real SDK and stubs only the transport.

function personalProject(id: string, inboxProject = false): Record<string, unknown> {
    return {
        id,
        name: inboxProject ? 'Inbox' : `Project ${id}`,
        can_assign_tasks: false,
        child_order: 0,
        color: 'grey',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        is_archived: false,
        is_deleted: false,
        is_favorite: false,
        is_frozen: false,
        view_style: 'list',
        default_order: 0,
        description: '',
        is_collapsed: false,
        is_shared: false,
        parent_id: null,
        inbox_project: inboxProject,
    }
}

function apiReturning(userPlanLimits: unknown, projects: unknown[]): TodoistApi {
    const customFetch: CustomFetch = async (url, init) => {
        const route = `${init?.method} ${new URL(url).pathname}`
        let body: unknown
        if (route === 'POST /api/v1/sync') {
            body = { sync_token: 'sync-token', full_sync: true, user_plan_limits: userPlanLimits }
        } else if (route === 'GET /api/v1/projects') {
            body = { results: projects, next_cursor: null }
        } else {
            throw new Error(`Unexpected request: ${route}`)
        }
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            text: async () => JSON.stringify(body),
            json: async () => body,
        }
    }
    return new TodoistApi('token', { customFetch })
}

// The API sends `activity_log` as a Boolean alongside the numeric limits.
const proPlan = { plan_name: 'pro', max_projects: 300, activity_log: true, activity_log_limit: -1 }
const freePlan = {
    plan_name: 'free_new_4',
    max_projects: 5,
    activity_log: true,
    activity_log_limit: 7,
}

describe('ensurePersonalProjectCapacity over the real SDK', () => {
    it('allows a Pro account below its limit', async () => {
        const api = apiReturning({ current: proPlan, next: null }, [
            personalProject('inbox', true),
            personalProject('1'),
        ])

        await expect(ensurePersonalProjectCapacity(api)).resolves.toBeUndefined()
    })

    it('refuses a Free account at its limit', async () => {
        const api = apiReturning({ current: freePlan, next: proPlan }, [
            personalProject('inbox', true),
            ...['1', '2', '3', '4', '5'].map((id) => personalProject(id)),
        ])

        await expect(ensurePersonalProjectCapacity(api)).rejects.toMatchObject({
            code: 'PROJECT_LIMIT_REACHED',
            message: 'You have reached the limit of 5 active personal projects on your plan.',
        })
    })
})

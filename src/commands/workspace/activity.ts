import type { WorkspaceUser } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { lenientIdRef, resolveWorkspaceRef } from '../../lib/refs.js'

export interface WorkspaceActivityOptions {
    userIds?: string
    projectIds?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

export async function showWorkspaceActivity(
    ref: string,
    options: WorkspaceActivityOptions,
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    const api = await getApi()

    const userIds = options.userIds
        ? options.userIds
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
              .join(',')
        : undefined

    const projectIds = options.projectIds
        ? options.projectIds
              .split(',')
              .map((id) => lenientIdRef(id.trim(), 'project'))
              .join(',')
        : undefined

    const response = await api.getWorkspaceMembersActivity({
        workspaceId: workspace.id,
        userIds,
        projectIds,
    })
    const members = response.members

    // When --full, enrich with workspace user details for each member.
    let userMap: Map<string, WorkspaceUser> | null = null
    if (options.full || (!options.json && !options.ndjson)) {
        userMap = await buildUserMap(workspace.id)
    }

    if (options.json) {
        const output = options.full
            ? members.map((m) => ({
                  ...m,
                  fullName: userMap?.get(m.userId)?.fullName ?? null,
                  email: userMap?.get(m.userId)?.userEmail ?? null,
              }))
            : members
        // `nextCursor: null` matches the shape used by other list/report
        // commands so generic JSON consumers can treat all collections
        // uniformly.
        console.log(JSON.stringify({ results: output, nextCursor: null }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const m of members) {
            const output = options.full
                ? {
                      ...m,
                      fullName: userMap?.get(m.userId)?.fullName ?? null,
                      email: userMap?.get(m.userId)?.userEmail ?? null,
                  }
                : m
            console.log(JSON.stringify(output))
        }
        return
    }

    console.log(chalk.bold(`Members activity for ${workspace.name}:`))
    console.log('')

    if (members.length === 0) {
        console.log(chalk.dim('(no activity)'))
        return
    }

    for (const m of members) {
        const info = userMap?.get(m.userId)
        const name = info ? `${info.fullName} <${info.userEmail}>` : `id:${m.userId}`
        const assigned = `${m.tasksAssigned} assigned`
        const overdue =
            m.tasksOverdue > 0
                ? chalk.red(`${m.tasksOverdue} overdue`)
                : chalk.dim(`${m.tasksOverdue} overdue`)
        console.log(`${name}  ${chalk.dim(assigned)}  ${overdue}`)
    }
}

async function buildUserMap(workspaceId: string): Promise<Map<string, WorkspaceUser>> {
    const api = await getApi()
    const map = new Map<string, WorkspaceUser>()
    let cursor: string | undefined
    while (true) {
        const response = await api.getWorkspaceUsers({
            workspaceId,
            cursor,
            limit: 200,
        })
        for (const user of response.workspaceUsers) {
            map.set(user.userId, user)
        }
        if (!response.hasMore || !response.nextCursor) break
        cursor = response.nextCursor
    }
    return map
}

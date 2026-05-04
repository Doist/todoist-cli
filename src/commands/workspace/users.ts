import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatUserShortName } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'
import { WORKSPACE_ROLES } from './helpers.js'

export async function listWorkspaceUsers(
    ref: string | undefined,
    options: PaginatedViewOptions & { role?: string },
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : 50

    let roleFilter: Set<string> | null = null
    if (options.role) {
        const roles = options.role
            .toUpperCase()
            .split(',')
            .map((r) => r.trim())
        // Mimic Commander's .choices() error format for consistency
        for (const role of roles) {
            if (!WORKSPACE_ROLES.includes(role)) {
                throw new CliError(
                    'INVALID_ROLE',
                    `error: option '--role <roles>' argument '${role}' is invalid. Allowed choices are ${WORKSPACE_ROLES.join(', ')}.`,
                )
            }
        }
        roleFilter = new Set(roles)
    }

    const allUsers: Array<{
        userId: string
        email: string
        fullName: string
        role: string
    }> = []
    let cursor: string | undefined = options.cursor

    while (allUsers.length < targetLimit) {
        const response = await api.getWorkspaceUsers({
            workspaceId: workspace.id,
            cursor,
            limit: Math.min(targetLimit - allUsers.length, 200),
        })

        for (const user of response.workspaceUsers) {
            if (!roleFilter || roleFilter.has(user.role)) {
                allUsers.push({
                    userId: user.userId,
                    email: user.userEmail,
                    fullName: user.fullName,
                    role: user.role,
                })
            }
        }

        if (!response.hasMore || !response.nextCursor) break
        cursor = response.nextCursor
    }

    const users = allUsers.slice(0, targetLimit)
    const hasMore = allUsers.length > targetLimit || cursor !== undefined

    if (options.json) {
        const output = options.full
            ? users
            : users.map((u) => ({
                  id: u.userId,
                  name: u.fullName,
                  email: u.email,
                  role: u.role,
              }))
        console.log(
            JSON.stringify({ results: output, nextCursor: hasMore ? cursor : null }, null, 2),
        )
        return
    }

    if (options.ndjson) {
        for (const u of users) {
            const output = options.full
                ? u
                : {
                      id: u.userId,
                      name: u.fullName,
                      email: u.email,
                      role: u.role,
                  }
            console.log(JSON.stringify(output))
        }
        if (hasMore) {
            console.log(JSON.stringify({ _meta: true, nextCursor: cursor }))
        }
        return
    }

    for (const user of users) {
        const id = chalk.dim(`id:${user.userId}`)
        const name = formatUserShortName(user.fullName)
        const email = chalk.dim(`<${user.email}>`)
        const role = chalk.yellow(`[${user.role}]`)
        console.log(`${id}  ${name} ${email} ${role}`)
    }

    if (hasMore) {
        console.log(chalk.dim(`\n... more items exist. Use --all to fetch everything.`))
    }
}

import { isWorkspaceProject } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatUserShortName } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import type { ViewOptions } from '../../lib/options.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function listCollaborators(ref: string, options: ViewOptions = {}): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (isWorkspaceProject(project)) {
        const workspaceIdNum = parseInt(project.workspaceId, 10)
        const allUsers: Array<{
            userId: string
            fullName: string
            userEmail: string
            role: string
        }> = []
        let cursor: string | undefined

        while (true) {
            const response = await api.getWorkspaceUsers({
                workspaceId: workspaceIdNum,
                cursor,
                limit: 200,
            })

            for (const user of response.workspaceUsers) {
                allUsers.push({
                    userId: user.userId,
                    fullName: user.fullName,
                    userEmail: user.userEmail,
                    role: user.role,
                })
            }

            if (!response.hasMore || !response.nextCursor) break
            cursor = response.nextCursor
        }

        if (options.json) {
            const output = options.full
                ? allUsers
                : allUsers.map((u) => ({
                      id: u.userId,
                      name: u.fullName,
                      email: u.userEmail,
                      role: u.role,
                  }))
            console.log(JSON.stringify({ results: output, nextCursor: null }, null, 2))
            return
        }

        if (options.ndjson) {
            for (const u of allUsers) {
                const output = options.full
                    ? u
                    : {
                          id: u.userId,
                          name: u.fullName,
                          email: u.userEmail,
                          role: u.role,
                      }
                console.log(JSON.stringify(output))
            }
            return
        }

        for (const user of allUsers) {
            const id = chalk.dim(user.userId)
            const name = formatUserShortName(user.fullName)
            const email = chalk.dim(`<${user.userEmail}>`)
            const role = chalk.dim(`[${user.role}]`)
            console.log(`${id}  ${name} ${email} ${role}`)
        }
        return
    }

    if (!project.isShared) {
        throw new CliError('NOT_SHARED', 'Project is not shared.')
    }

    const allUsers: Array<{ id: string; name: string; email: string }> = []
    let cursor: string | undefined
    while (true) {
        const response = await api.getProjectCollaborators(project.id, { cursor })

        for (const user of response.results) {
            allUsers.push({ id: user.id, name: user.name, email: user.email })
        }

        if (!response.nextCursor) break
        cursor = response.nextCursor
    }

    if (options.json) {
        const output = options.full
            ? allUsers
            : allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email }))
        console.log(JSON.stringify({ results: output, nextCursor: null }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const u of allUsers) {
            console.log(
                JSON.stringify(options.full ? u : { id: u.id, name: u.name, email: u.email }),
            )
        }
        return
    }

    for (const user of allUsers) {
        const id = chalk.dim(user.id)
        const name = formatUserShortName(user.name)
        const email = chalk.dim(`<${user.email}>`)
        console.log(`${id}  ${name} ${email}`)
    }
}

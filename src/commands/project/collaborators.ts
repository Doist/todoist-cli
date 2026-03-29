import chalk from 'chalk'
import { getApi, isWorkspaceProject } from '../../lib/api/core.js'
import { formatUserShortName } from '../../lib/collaborators.js'
import { formatError } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function listCollaborators(ref: string): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (isWorkspaceProject(project)) {
        const workspaceIdNum = parseInt(project.workspaceId, 10)
        let cursor: string | undefined

        while (true) {
            const response = await api.getWorkspaceUsers({
                workspaceId: workspaceIdNum,
                cursor,
                limit: 200,
            })

            for (const user of response.workspaceUsers) {
                const id = chalk.dim(user.userId)
                const name = formatUserShortName(user.fullName)
                const email = chalk.dim(`<${user.userEmail}>`)
                const role = chalk.dim(`[${user.role}]`)
                console.log(`${id}  ${name} ${email} ${role}`)
            }

            if (!response.hasMore || !response.nextCursor) break
            cursor = response.nextCursor
        }
        return
    }

    if (!project.isShared) {
        throw new Error(formatError('NOT_SHARED', 'Project is not shared.'))
    }

    let cursor: string | undefined
    while (true) {
        const response = await api.getProjectCollaborators(project.id, { cursor })

        for (const user of response.results) {
            const id = chalk.dim(user.id)
            const name = formatUserShortName(user.name)
            const email = chalk.dim(`<${user.email}>`)
            console.log(`${id}  ${name} ${email}`)
        }

        if (!response.nextCursor) break
        cursor = response.nextCursor
    }
}

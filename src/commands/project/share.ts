import { isWorkspaceProject, WORKSPACE_ROLES, type WorkspaceRole } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { shareProject as shareProjectSync } from '../../lib/api/projects-sync.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export type ProjectShareOptions = {
    role?: string
    message?: string
    autoInvite?: boolean
    json?: boolean
    dryRun?: boolean
}

function parseRole(role: string | undefined): WorkspaceRole {
    if (role === undefined) {
        return 'MEMBER'
    }
    const upper = role.toUpperCase()
    if (!(WORKSPACE_ROLES as readonly string[]).includes(upper)) {
        throw new CliError('INVALID_ROLE', `Invalid role "${role}".`, [
            `Valid roles: ${WORKSPACE_ROLES.map((r) => r.toLowerCase()).join(', ')}`,
        ])
    }
    return upper as WorkspaceRole
}

async function isWorkspaceMember(
    api: Awaited<ReturnType<typeof getApi>>,
    workspaceId: string,
    email: string,
): Promise<boolean> {
    const target = email.toLowerCase()
    let cursor: string | undefined

    while (true) {
        const response = await api.getWorkspaceUsers({ workspaceId, cursor, limit: 200 })
        if (response.workspaceUsers.some((u) => u.userEmail.toLowerCase() === target)) {
            return true
        }
        if (!response.hasMore || !response.nextCursor) break
        cursor = response.nextCursor
    }
    return false
}

export async function shareProject(
    ref: string,
    email: string,
    options: ProjectShareOptions = {},
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    // Personal/shared project: no roles, no workspace invite.
    if (!isWorkspaceProject(project)) {
        if (options.role !== undefined || options.autoInvite) {
            console.error(
                chalk.dim(
                    '--role and --auto-invite are ignored for personal (non-workspace) projects.',
                ),
            )
        }

        if (options.dryRun) {
            printDryRun('share project', {
                Project: project.name,
                Email: email,
            })
            return
        }

        await shareProjectSync({ projectId: project.id, email, message: options.message })

        if (options.json) {
            console.log(
                JSON.stringify(
                    { projectId: project.id, projectName: project.name, email, autoInvited: false },
                    null,
                    2,
                ),
            )
            return
        }
        if (!isQuiet()) {
            console.log(`Shared: ${project.name} with ${email}`)
            console.log(chalk.dim(`ID: ${project.id}`))
        }
        return
    }

    // Workspace project: role applies, optional auto-invite to the workspace.
    const role = parseRole(options.role)
    const isMember = await isWorkspaceMember(api, project.workspaceId, email)

    if (options.dryRun) {
        printDryRun('share project', {
            Project: project.name,
            Email: email,
            Role: role,
            'Auto-invite': !isMember
                ? options.autoInvite
                    ? 'yes'
                    : 'required (not a member)'
                : undefined,
        })
        return
    }

    if (!isMember && !options.autoInvite) {
        throw new CliError('NOT_WORKSPACE_MEMBER', `${email} is not a member of this workspace.`, [
            'Pass --auto-invite to invite them to the workspace first',
        ])
    }

    const autoInvited = !isMember && Boolean(options.autoInvite)
    if (autoInvited) {
        await api.inviteWorkspaceUsers({
            workspaceId: project.workspaceId,
            emailList: [email],
            role,
        })
    }

    await shareProjectSync({
        projectId: project.id,
        email,
        message: options.message,
        workspaceRole: role,
    })

    if (options.json) {
        console.log(
            JSON.stringify(
                { projectId: project.id, projectName: project.name, email, role, autoInvited },
                null,
                2,
            ),
        )
        return
    }
    if (!isQuiet()) {
        if (autoInvited) {
            console.log(`Invited ${email} to workspace`)
        }
        console.log(`Shared: ${project.name} with ${email}`)
        console.log(chalk.dim(`Role: ${role}`))
    }
}

import { isWorkspaceProject, type WorkspaceRole } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { shareProject as shareProjectSync } from '../../lib/api/projects-sync.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { findUser } from '../workspace/helpers.js'

export type ProjectShareOptions = {
    role?: string
    message?: string
    autoInvite?: boolean
    json?: boolean
    dryRun?: boolean
}

// Role values are validated by Commander's `--role` choices; default to MEMBER.
function parseRole(role: string | undefined): WorkspaceRole {
    return (role?.toUpperCase() ?? 'MEMBER') as WorkspaceRole
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
                formatJson({
                    projectId: project.id,
                    projectName: project.name,
                    email,
                    autoInvited: false,
                }),
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
    const lowerEmail = email.toLowerCase()
    const isMember =
        (await findUser(project.workspaceId, (u) => u.userEmail.toLowerCase() === lowerEmail)) !==
        null

    // Validate before the dry-run early return so a dry run reflects the real outcome.
    if (!isMember && !options.autoInvite) {
        throw new CliError('NOT_WORKSPACE_MEMBER', `${email} is not a member of this workspace.`, [
            'Pass --auto-invite to invite them to the workspace first',
        ])
    }

    const autoInvited = !isMember

    if (options.dryRun) {
        printDryRun('share project', {
            Project: project.name,
            Email: email,
            Role: role,
            'Auto-invite': autoInvited ? 'yes' : undefined,
        })
        return
    }

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
            formatJson({
                projectId: project.id,
                projectName: project.name,
                email,
                role,
                autoInvited,
            }),
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

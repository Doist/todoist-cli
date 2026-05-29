import { isWorkspaceProject, type WorkspaceRole } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { shareProject as shareProjectSync } from '../../lib/api/projects-sync.js'
import { CliError, type ErrorCode } from '../../lib/errors.js'
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

// The backend rejects shares/invites that exceed plan limits or permissions
// via the Sync API's per-command status. The SDK surfaces these as errors but
// drops the machine `error_tag`, leaving only the HTTP status and the human
// message — so we match those stable messages to attach actionable hints.
const SHARE_ERROR_RULES: Array<{ match: RegExp; code: ErrorCode; hints: string[] }> = [
    {
        match: /too many invitations/i,
        code: 'COLLABORATOR_LIMIT_REACHED',
        hints: [
            'The project is at its collaborator limit (active members plus pending invitations).',
            'Remove a collaborator first, or move the project into a workspace.',
        ],
    },
    {
        match: /already a collaborator/i,
        code: 'ALREADY_COLLABORATOR',
        hints: ['That person already has access to this project.'],
    },
    {
        match: /maximum number of guests/i,
        code: 'WORKSPACE_GUEST_LIMIT_REACHED',
        hints: [
            'The workspace has reached its guest limit.',
            'Invite them as a member (--role member), remove an existing guest, or upgrade the workspace plan.',
        ],
    },
    {
        match: /maximum number of members/i,
        code: 'WORKSPACE_MEMBER_LIMIT_REACHED',
        hints: ['The workspace is at its member limit. Upgrade the plan or remove a member.'],
    },
    {
        match: /already a member of your workspace/i,
        code: 'ALREADY_WORKSPACE_MEMBER',
        hints: ['They are already a workspace member — share without --auto-invite.'],
    },
    {
        match: /reached the limit on the number of workspaces/i,
        code: 'WORKSPACE_JOIN_LIMIT_REACHED',
        hints: ['The invitee has joined the maximum number of workspaces and cannot join another.'],
    },
    {
        match: /not verified/i,
        code: 'ACCOUNT_NOT_VERIFIED',
        hints: ['Verify your Todoist account email before sharing projects.'],
    },
    {
        match: /project is frozen/i,
        code: 'PROJECT_FROZEN',
        hints: ['This project is frozen and cannot accept new collaborators right now.'],
    },
    {
        match: /disabled by the admins/i,
        code: 'SHARE_FORBIDDEN',
        hints: [
            'Inviting people from outside the workspace is disabled.',
            'Ask a workspace admin, or add them to the workspace first.',
        ],
    },
]

// Re-throw a known share/invite limit or permission failure as a CliError with
// a clearer code and hints, preserving the backend message. Unknown errors pass
// through unchanged.
function rethrowShareError(error: unknown): never {
    if (error instanceof Error) {
        const rule = SHARE_ERROR_RULES.find((r) => r.match.test(error.message))
        if (rule) {
            throw new CliError(rule.code, error.message, rule.hints)
        }
    }
    throw error
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

        try {
            await shareProjectSync({ projectId: project.id, email, message: options.message })
        } catch (error) {
            rethrowShareError(error)
        }

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

    try {
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
    } catch (error) {
        rethrowShareError(error)
    }

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

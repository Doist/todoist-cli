import chalk from 'chalk'
import { Command, Option } from 'commander'
import { getApi, isWorkspaceProject } from '../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces } from '../lib/api/workspaces.js'
import { formatUserShortName } from '../lib/collaborators.js'
import { withUnvalidatedChoices } from '../lib/completion.js'
import type { PaginatedViewOptions } from '../lib/options.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

const WORKSPACE_ROLES = ['ADMIN', 'MEMBER', 'GUEST']

interface UsersOptions {
    role?: string
    limit?: string
    cursor?: string
    all?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

interface ProjectsOptions {
    limit?: string
    cursor?: string
    all?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

async function listWorkspaces(options: PaginatedViewOptions): Promise<void> {
    const workspaces = await fetchWorkspaces()

    if (workspaces.length === 0) {
        return
    }

    if (options.json) {
        const output = options.full
            ? workspaces
            : workspaces.map((w) => ({
                  id: w.id,
                  name: w.name,
                  plan: w.plan,
                  role: w.role,
                  memberCount: w.currentMemberCount,
                  projectCount: w.currentActiveProjects,
              }))
        console.log(JSON.stringify({ results: output, nextCursor: null }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const w of workspaces) {
            const output = options.full
                ? w
                : {
                      id: w.id,
                      name: w.name,
                      plan: w.plan,
                      role: w.role,
                      memberCount: w.currentMemberCount,
                      projectCount: w.currentActiveProjects,
                  }
            console.log(JSON.stringify(output))
        }
        return
    }

    for (const w of workspaces) {
        const id = chalk.dim(`id:${w.id}`)
        const name = w.name
        const plan = chalk.cyan(`(${w.plan})`)
        const stats = chalk.dim(
            `${w.currentMemberCount} members, ${w.currentActiveProjects} projects`,
        )
        const role = chalk.yellow(`[${w.role}]`)
        console.log(`${id}  ${name} ${plan} - ${stats} ${role}`)
    }
}

async function viewWorkspace(ref: string): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)

    console.log(chalk.bold(workspace.name))
    console.log('')
    console.log(`ID:       ${workspace.id}`)
    console.log(`Plan:     ${workspace.plan}`)
    console.log(`Role:     ${workspace.role}`)
    if (workspace.domainName) {
        console.log(`Domain:   ${workspace.domainName}`)
    }
    const { adminCount, memberCount, guestCount } = workspace.memberCountByType
    console.log(
        `Members:  ${workspace.currentMemberCount} (${adminCount} admins, ${memberCount} members, ${guestCount} guests)`,
    )
    console.log(`Projects: ${workspace.currentActiveProjects} active`)
}

async function listWorkspaceProjects(ref: string, options: ProjectsOptions): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.projects

    const { results: allProjectsRaw } = await paginate(
        (cursor, limit) => api.getProjects({ cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER, startCursor: options.cursor },
    )

    const workspaceProjects = allProjectsRaw.filter(
        (p) => isWorkspaceProject(p) && p.workspaceId === workspace.id,
    )
    const allProjects = workspaceProjects.slice(0, targetLimit)
    const nextCursor = workspaceProjects.length > targetLimit ? 'has-more' : null

    const folders = await fetchWorkspaceFolders()
    const workspaceFolders = folders.filter((f) => f.workspaceId === workspace.id)
    const folderMap = new Map(workspaceFolders.map((f) => [f.id, f.name]))

    if (options.json) {
        const output = options.full
            ? allProjects
            : allProjects.map((p) => ({
                  id: p.id,
                  name: p.name,
                  folderId: isWorkspaceProject(p) ? p.folderId : null,
                  folderName:
                      isWorkspaceProject(p) && p.folderId ? folderMap.get(p.folderId) : null,
                  status: isWorkspaceProject(p) ? p.status : null,
              }))
        console.log(JSON.stringify({ results: output, nextCursor }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const p of allProjects) {
            const output = options.full
                ? p
                : {
                      id: p.id,
                      name: p.name,
                      folderId: isWorkspaceProject(p) ? p.folderId : null,
                      folderName:
                          isWorkspaceProject(p) && p.folderId ? folderMap.get(p.folderId) : null,
                      status: isWorkspaceProject(p) ? p.status : null,
                  }
            console.log(JSON.stringify(output))
        }
        if (nextCursor) {
            console.log(JSON.stringify({ _meta: true, nextCursor }))
        }
        return
    }

    const projectsByFolder = new Map<string | null, typeof allProjects>()
    for (const project of allProjects) {
        const folderId = isWorkspaceProject(project) ? project.folderId : null
        if (!projectsByFolder.has(folderId)) {
            projectsByFolder.set(folderId, [])
        }
        projectsByFolder.get(folderId)?.push(project)
    }

    const sortedFolderIds = [...projectsByFolder.keys()].sort((a, b) => {
        if (a === null) return 1
        if (b === null) return -1
        const nameA = folderMap.get(a) ?? ''
        const nameB = folderMap.get(b) ?? ''
        return nameA.localeCompare(nameB)
    })

    let isFirst = true
    for (const folderId of sortedFolderIds) {
        const projects = projectsByFolder.get(folderId)
        if (!projects || projects.length === 0) continue

        const folderName = folderId ? folderMap.get(folderId) : null
        const hasHeader = folderName || (folderId === null && projectsByFolder.size > 1)

        if (!isFirst && hasHeader) {
            console.log('')
        }
        isFirst = false

        if (folderName) {
            console.log(chalk.cyan(`${folderName}/`))
        } else if (folderId === null && projectsByFolder.size > 1) {
            console.log(chalk.dim('(no folder)'))
        }

        for (const project of projects) {
            const id = chalk.dim(`id:${project.id}`)
            const name = project.name
            const indent = hasHeader ? '  ' : ''
            console.log(`${indent}${id}  ${name}`)
        }
    }

    if (nextCursor) {
        console.log(chalk.dim(`\n... more items exist. Use --all to fetch everything.`))
    }
}

async function listWorkspaceUsers(ref: string, options: UsersOptions): Promise<void> {
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
                throw new Error(
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

    const workspaceIdNum = parseInt(workspace.id, 10)
    while (allUsers.length < targetLimit) {
        const response = await api.getWorkspaceUsers({
            workspaceId: workspaceIdNum,
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

export function registerWorkspaceCommand(program: Command): void {
    const workspace = program.command('workspace').description('Manage workspaces')

    workspace
        .command('list')
        .description('List all workspaces')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listWorkspaces)

    workspace
        .command('view [ref]', { isDefault: true })
        .description('View workspace details')
        .action((ref) => {
            if (!ref) {
                workspace.help()
                return
            }
            return viewWorkspace(ref)
        })

    const projectsCmd = workspace
        .command('projects [ref]')
        .description('List projects in a workspace')
        .option('--workspace <ref>', 'Workspace name or id:xxx')
        .option('--limit <n>', 'Limit number of results')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((refArg: string | undefined, options: ProjectsOptions & { workspace?: string }) => {
            if (refArg && options.workspace) {
                throw new Error('Cannot specify workspace both as argument and --workspace flag')
            }
            const ref = refArg || options.workspace
            if (!ref) {
                projectsCmd.help()
                return
            }
            return listWorkspaceProjects(ref, options)
        })

    const usersCmd = workspace
        .command('users [ref]')
        .description('List users in a workspace')
        .option('--workspace <ref>', 'Workspace name or id:xxx')
        .addOption(
            withUnvalidatedChoices(
                new Option(
                    '--role <roles>',
                    `Filter by role (comma-separated: ${WORKSPACE_ROLES.join(',')})`,
                ),
                WORKSPACE_ROLES,
            ),
        )
        .option('--limit <n>', 'Limit number of results')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((refArg: string | undefined, options: UsersOptions & { workspace?: string }) => {
            if (refArg && options.workspace) {
                throw new Error('Cannot specify workspace both as argument and --workspace flag')
            }
            const ref = refArg || options.workspace
            if (!ref) {
                usersCmd.help()
                return
            }
            return listWorkspaceUsers(ref, options)
        })
}

import type { ProjectViewStyle } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { Command, Option } from 'commander'
import { getApi, isWorkspaceProject, type Project } from '../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces, type Workspace } from '../lib/api/workspaces.js'
import { openInBrowser } from '../lib/browser.js'
import { formatUserShortName } from '../lib/collaborators.js'
import { withCaseInsensitiveChoices } from '../lib/completion.js'
import {
    formatError,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { resolveProjectRef } from '../lib/refs.js'
import { projectUrl } from '../lib/urls.js'

const VIEW_STYLE_CHOICES: ProjectViewStyle[] = ['list', 'board', 'calendar']

interface ListOptions {
    limit?: string
    cursor?: string
    all?: boolean
    personal?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
    showUrls?: boolean
}

async function listProjects(options: ListOptions): Promise<void> {
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.projects

    const { results: projects, nextCursor } = await paginate(
        (cursor, limit) => api.getProjects({ cursor: cursor ?? undefined, limit }),
        { limit: targetLimit, startCursor: options.cursor },
    )

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: projects, nextCursor },
                'project',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: projects, nextCursor },
                'project',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.personal) {
        const personalOnly = projects.filter((p) => !isWorkspaceProject(p))
        for (const project of personalOnly) {
            const id = chalk.dim(project.id)
            let name = project.isFavorite ? chalk.yellow(project.name) : project.name
            if (project.isShared) {
                name = `${name} ${chalk.dim('[shared]')}`
            }
            console.log(`${id}  ${name}`)
            if (options.showUrls) {
                console.log(`  ${chalk.dim(projectUrl(project.id))}`)
            }
        }
        console.log(formatNextCursorFooter(nextCursor))
        return
    }

    const workspaceProjects = new Map<string, Project[]>()
    const personalProjects: Project[] = []

    for (const project of projects) {
        if (isWorkspaceProject(project)) {
            const list = workspaceProjects.get(project.workspaceId) || []
            list.push(project)
            workspaceProjects.set(project.workspaceId, list)
        } else {
            personalProjects.push(project)
        }
    }

    let workspaces: Workspace[] = []
    if (workspaceProjects.size > 0) {
        workspaces = await fetchWorkspaces()
    }
    const workspaceMap = new Map(workspaces.map((w) => [w.id, w]))

    if (personalProjects.length > 0) {
        if (workspaceProjects.size > 0) {
            console.log(chalk.bold('Personal'))
        }
        for (const project of personalProjects) {
            const id = chalk.dim(project.id)
            let name = project.isFavorite ? chalk.yellow(project.name) : project.name
            if (project.isShared) {
                name = `${name} ${chalk.dim('[shared]')}`
            }
            const indent = workspaceProjects.size > 0 ? '  ' : ''
            console.log(`${indent}${id}  ${name}`)
            if (options.showUrls) {
                console.log(`${indent}  ${chalk.dim(projectUrl(project.id))}`)
            }
        }
        if (workspaceProjects.size > 0) {
            console.log('')
        }
    }

    const sortedWorkspaceIds = [...workspaceProjects.keys()].sort((a, b) => {
        const nameA = workspaceMap.get(a)?.name ?? ''
        const nameB = workspaceMap.get(b)?.name ?? ''
        return nameA.localeCompare(nameB)
    })

    for (const workspaceId of sortedWorkspaceIds) {
        const wprojects = workspaceProjects.get(workspaceId)
        if (!wprojects) continue // Should not happen since workspaceId comes from keys()
        const workspace = workspaceMap.get(workspaceId)
        const workspaceName = workspace?.name ?? `Workspace ${workspaceId}`
        console.log(chalk.bold(workspaceName))
        for (const project of wprojects) {
            const id = chalk.dim(project.id)
            const name = project.isFavorite ? chalk.yellow(project.name) : project.name
            console.log(`  ${id}  ${name}`)
            if (options.showUrls) {
                console.log(`    ${chalk.dim(projectUrl(project.id))}`)
            }
        }
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))

    if (sortedWorkspaceIds.length > 0) {
        console.log(
            chalk.dim('Tip: Use `td workspace projects <name>` for a detailed view with folders.'),
        )
    }
}

async function viewProject(ref: string): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    console.log(chalk.bold(project.name))
    console.log('')
    console.log(`ID:       ${project.id}`)

    if (isWorkspaceProject(project)) {
        const [workspaces, folders] = await Promise.all([
            fetchWorkspaces(),
            fetchWorkspaceFolders(),
        ])
        const workspace = workspaces.find((w) => w.id === project.workspaceId)
        if (workspace) {
            console.log(`Workspace: ${workspace.name}`)
        }
        if (project.folderId) {
            const folder = folders.find((f) => f.id === project.folderId)
            if (folder) {
                console.log(`Folder:   ${folder.name}`)
            }
        }
    } else if (project.isShared) {
        console.log(`Shared:   Yes`)
    }

    console.log(`Color:    ${project.color}`)
    console.log(`Favorite: ${project.isFavorite ? 'Yes' : 'No'}`)
    console.log(`URL:      ${projectUrl(project.id)}`)

    const { results: tasks } = await api.getTasks({ projectId: project.id })

    if (tasks.length > 0) {
        console.log('')
        console.log(chalk.dim(`--- Tasks (${tasks.length}) ---`))
        for (const task of tasks) {
            const priority = chalk.dim(`p${5 - task.priority}`)
            console.log(`  ${priority}  ${task.content}`)
        }
    }
}

async function deleteProject(ref: string, options: { yes?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const { results: tasks } = await api.getTasks({ projectId: project.id })
    if (tasks.length > 0) {
        throw new Error(
            formatError(
                'HAS_TASKS',
                `Cannot delete project: ${tasks.length} uncompleted task${tasks.length === 1 ? '' : 's'} remain.`,
            ),
        )
    }

    if (!options.yes) {
        console.log(`Would delete project: ${project.name}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteProject(project.id)
    console.log(`Deleted project: ${project.name}`)
}

async function listCollaborators(ref: string): Promise<void> {
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

interface CreateOptions {
    name: string
    color?: string
    favorite?: boolean
    parent?: string
    viewStyle?: string
}

async function createProject(options: CreateOptions): Promise<void> {
    const api = await getApi()

    let parentId: string | undefined
    if (options.parent) {
        const parentProject = await resolveProjectRef(api, options.parent)
        if (isWorkspaceProject(parentProject)) {
            throw new Error(
                formatError(
                    'WORKSPACE_NO_SUBPROJECTS',
                    'Workspace projects do not support sub-projects.',
                    ['Sub-projects are only supported for personal projects.'],
                ),
            )
        }
        parentId = parentProject.id
    }

    const project = await api.addProject({
        name: options.name,
        color: options.color,
        isFavorite: options.favorite,
        parentId,
        viewStyle: options.viewStyle as ProjectViewStyle,
    })

    console.log(`Created: ${project.name}`)
    console.log(chalk.dim(`ID: ${project.id}`))
}

interface UpdateOptions {
    name?: string
    color?: string
    favorite?: boolean
    viewStyle?: string
}

async function updateProject(ref: string, options: UpdateOptions): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const args: {
        name?: string
        color?: string
        isFavorite?: boolean
        viewStyle?: ProjectViewStyle
    } = {}
    if (options.name) args.name = options.name
    if (options.color) args.color = options.color
    if (options.favorite === true) args.isFavorite = true
    if (options.favorite === false) args.isFavorite = false
    if (options.viewStyle) args.viewStyle = options.viewStyle as ProjectViewStyle

    if (Object.keys(args).length === 0) {
        throw new Error(formatError('NO_CHANGES', 'No changes specified.'))
    }

    const updated = await api.updateProject(project.id, args)
    console.log(`Updated: ${updated.name}`)
}

async function archiveProject(ref: string): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    await api.archiveProject(project.id)
    console.log(`Archived: ${project.name}`)
}

async function unarchiveProject(ref: string): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    await api.unarchiveProject(project.id)
    console.log(`Unarchived: ${project.name}`)
}

async function browseProject(ref: string): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    await openInBrowser(projectUrl(project.id))
}

export function registerProjectCommand(program: Command): void {
    const project = program.command('project').description('Manage projects')

    project
        .command('list')
        .description('List all projects')
        .option('--limit <n>', 'Limit number of results (default: 50)')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--personal', 'Show only personal projects')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each project')
        .action(listProjects)

    project
        .command('view [ref]', { isDefault: true })
        .description('View project details')
        .action((ref) => {
            if (!ref) {
                project.help()
                return
            }
            return viewProject(ref)
        })

    const collaboratorsCmd = project
        .command('collaborators [ref]')
        .description('List project collaborators')
        .action((ref) => {
            if (!ref) {
                collaboratorsCmd.help()
                return
            }
            return listCollaborators(ref)
        })

    const deleteCmd = project
        .command('delete [ref]')
        .description('Delete a project (must have no uncompleted tasks)')
        .option('--yes', 'Confirm deletion')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteProject(ref, options)
        })

    const createCmd = project
        .command('create')
        .description('Create a project')
        .option('--name <name>', 'Project name (required)')
        .option('--color <color>', 'Project color')
        .option('--favorite', 'Mark as favorite')
        .option('--parent <ref>', 'Parent project (name or id:xxx)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--view-style <style>', 'View style (list, board, or calendar)'),
                VIEW_STYLE_CHOICES,
            ),
        )
        .action((options) => {
            if (!options.name) {
                createCmd.help()
                return
            }
            return createProject(options)
        })

    const updateCmd = project
        .command('update [ref]')
        .description('Update a project')
        .option('--name <name>', 'New name')
        .option('--color <color>', 'New color')
        .option('--favorite', 'Mark as favorite')
        .option('--no-favorite', 'Remove from favorites')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--view-style <style>', 'View style (list, board, or calendar)'),
                VIEW_STYLE_CHOICES,
            ),
        )
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateProject(ref, options)
        })

    const archiveCmd = project
        .command('archive [ref]')
        .description('Archive a project')
        .action((ref) => {
            if (!ref) {
                archiveCmd.help()
                return
            }
            return archiveProject(ref)
        })

    const unarchiveCmd = project
        .command('unarchive [ref]')
        .description('Unarchive a project')
        .action((ref) => {
            if (!ref) {
                unarchiveCmd.help()
                return
            }
            return unarchiveProject(ref)
        })

    const browseCmd = project
        .command('browse [ref]')
        .description('Open project in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseProject(ref)
        })
}

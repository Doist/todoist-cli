import type {
    ColorKey,
    GetProjectActivityStatsArgs,
    MoveProjectToWorkspaceArgs,
    ProjectViewStyle,
    ProjectVisibility,
} from '@doist/todoist-api-typescript'
import { ProjectVisibilitySchema } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { Command, Option } from 'commander'
import { getApi, isPersonalProject, isWorkspaceProject, type Project } from '../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces, type Workspace } from '../lib/api/workspaces.js'
import { openInBrowser } from '../lib/browser.js'
import { formatUserShortName } from '../lib/collaborators.js'
import { withCaseInsensitiveChoices } from '../lib/completion.js'
import type { PaginatedViewOptions, ViewOptions } from '../lib/options.js'
import {
    formatError,
    formatHealthStatus,
    formatJson,
    formatNdjson,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatProgressBar,
    formatTaskRow,
    isAccessible,
    printDryRun,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import {
    lenientIdRef,
    resolveFolderRef,
    resolveProjectRef,
    resolveWorkspaceRef,
} from '../lib/refs.js'
import { projectUrl } from '../lib/urls.js'

const VIEW_STYLE_CHOICES: ProjectViewStyle[] = ['list', 'board', 'calendar']

type ListOptions = PaginatedViewOptions & { personal?: boolean }

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
            let name = project.isFavorite
                ? chalk.yellow(`${project.name}${isAccessible() ? ' ★' : ''}`)
                : project.name
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
            let name = project.isFavorite
                ? chalk.yellow(`${project.name}${isAccessible() ? ' ★' : ''}`)
                : project.name
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
            const name = project.isFavorite
                ? chalk.yellow(`${project.name}${isAccessible() ? ' ★' : ''}`)
                : project.name
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

export async function viewProject(
    ref: string,
    options: ViewOptions & { detailed?: boolean } = {},
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (options.detailed) {
        const fullData = await api.getFullProject(project.id)

        if (options.json) {
            const output = {
                project: fullData.project
                    ? JSON.parse(
                          formatJson(fullData.project, 'project', options.full, options.showUrls),
                      )
                    : null,
                commentsCount: fullData.commentsCount,
                tasks: JSON.parse(
                    formatJson(fullData.tasks, 'task', options.full, options.showUrls),
                ),
                sections: JSON.parse(
                    formatJson(fullData.sections, 'section', options.full, options.showUrls),
                ),
                collaborators: fullData.collaborators,
                notes: fullData.notes,
            }
            console.log(JSON.stringify(output, null, 2))
            return
        }

        if (options.ndjson) {
            const lines: string[] = []
            if (fullData.project) {
                lines.push(
                    formatNdjson([fullData.project], 'project', options.full, options.showUrls),
                )
            }
            if (fullData.tasks.length > 0) {
                lines.push(formatNdjson(fullData.tasks, 'task', options.full, options.showUrls))
            }
            if (fullData.sections.length > 0) {
                lines.push(
                    formatNdjson(fullData.sections, 'section', options.full, options.showUrls),
                )
            }
            if (fullData.collaborators.length > 0) {
                lines.push(formatNdjson(fullData.collaborators))
            }
            if (fullData.notes.length > 0) {
                lines.push(formatNdjson(fullData.notes))
            }
            console.log(lines.join('\n'))
            return
        }

        const displayProject = fullData.project ?? project

        console.log(chalk.bold(displayProject.name))
        console.log('')
        console.log(`ID:       ${displayProject.id}`)

        if (isWorkspaceProject(displayProject)) {
            const workspaces = await fetchWorkspaces()
            const folders = await fetchWorkspaceFolders()
            const workspace = workspaces.find((w) => w.id === displayProject.workspaceId)
            if (workspace) {
                console.log(`Workspace: ${workspace.name}`)
            }
            if (displayProject.folderId) {
                const folder = folders.find((f) => f.id === displayProject.folderId)
                if (folder) {
                    console.log(`Folder:   ${folder.name}`)
                }
            }
        } else if (displayProject.isShared) {
            console.log(`Shared:   Yes`)
        }

        console.log(`Color:    ${displayProject.color}`)
        console.log(`Favorite: ${displayProject.isFavorite ? 'Yes' : 'No'}`)
        console.log(`Comments: ${fullData.commentsCount}`)
        console.log(`URL:      ${projectUrl(displayProject.id)}`)

        if (fullData.tasks.length > 0) {
            console.log('')
            console.log(chalk.dim(`--- Tasks (${fullData.tasks.length}) ---`))
            for (const task of fullData.tasks) {
                console.log(formatTaskRow({ task, showUrl: options.showUrls }))
                console.log('')
            }
        }

        if (fullData.sections.length > 0) {
            console.log(chalk.dim(`--- Sections (${fullData.sections.length}) ---`))
            for (const section of fullData.sections) {
                console.log(`${chalk.dim(section.id)}  ${section.name}`)
            }
            console.log('')
        }

        if (fullData.collaborators.length > 0) {
            console.log(chalk.dim(`--- Collaborators (${fullData.collaborators.length}) ---`))
            for (const user of fullData.collaborators) {
                console.log(`${chalk.dim(user.id)}  ${formatUserShortName(user.name)}`)
            }
            console.log('')
        }

        if (fullData.notes.length > 0) {
            console.log(chalk.dim(`--- Notes (${fullData.notes.length}) ---`))
            for (const note of fullData.notes) {
                console.log(`${chalk.dim(note.id)}  ${note.content}`)
            }
            console.log('')
        }

        return
    }

    if (options.json) {
        console.log(formatJson(project, 'project', options.full, options.showUrls))
        return
    }

    const { results: tasks } = await api.getTasks({ projectId: project.id })

    if (options.ndjson) {
        const lines: string[] = []
        lines.push(formatNdjson([project], 'project', options.full, options.showUrls))
        if (tasks.length > 0) {
            lines.push(formatNdjson(tasks, 'task', options.full, options.showUrls))
        }
        console.log(lines.join('\n'))
        return
    }

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

    if (tasks.length > 0) {
        console.log('')
        console.log(chalk.dim(`--- Tasks (${tasks.length}) ---`))
        for (const task of tasks) {
            console.log(formatTaskRow({ task, showUrl: options.showUrls }))
            console.log('')
        }
    }
}

async function deleteProject(
    ref: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
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

    if (options.dryRun) {
        printDryRun('delete project', { Project: project.name })
        return
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
    color?: ColorKey
    favorite?: boolean
    parent?: string
    viewStyle?: string
    json?: boolean
    dryRun?: boolean
}

async function createProject(options: CreateOptions): Promise<void> {
    if (options.dryRun) {
        printDryRun('create project', {
            Name: options.name,
            Color: options.color,
            Favorite: options.favorite ? 'yes' : undefined,
            Parent: options.parent,
            'View style': options.viewStyle,
        })
        return
    }

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

    if (options.json) {
        console.log(formatJson(project, 'project'))
        return
    }

    console.log(`Created: ${project.name}`)
    console.log(chalk.dim(`ID: ${project.id}`))
}

interface UpdateOptions {
    name?: string
    color?: ColorKey
    favorite?: boolean
    viewStyle?: string
    json?: boolean
    dryRun?: boolean
}

async function updateProject(ref: string, options: UpdateOptions): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const args: {
        name?: string
        color?: ColorKey
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

    if (options.dryRun) {
        printDryRun('update project', {
            Project: project.name,
            Name: args.name,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
            'View style': args.viewStyle,
        })
        return
    }

    const updated = await api.updateProject(project.id, args)

    if (options.json) {
        console.log(formatJson(updated, 'project'))
        return
    }

    console.log(`Updated: ${updated.name}`)
}

async function archiveProject(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (options.dryRun) {
        printDryRun('archive project', { Project: project.name })
        return
    }

    await api.archiveProject(project.id)
    console.log(`Archived: ${project.name}`)
}

async function unarchiveProject(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (options.dryRun) {
        printDryRun('unarchive project', { Project: project.name })
        return
    }

    await api.unarchiveProject(project.id)
    console.log(`Unarchived: ${project.name}`)
}

async function browseProject(ref: string): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    await openInBrowser(projectUrl(project.id))
}

const validVisibilities = ProjectVisibilitySchema.options

type MoveOptions = {
    toWorkspace?: string
    toPersonal?: boolean
    folder?: string
    visibility?: string
    yes?: boolean
    dryRun?: boolean
}

async function moveProject(ref: string, options: MoveOptions): Promise<void> {
    if (options.toWorkspace && options.toPersonal) {
        throw new Error(
            formatError('INVALID_OPTIONS', 'Cannot specify both --to-workspace and --to-personal.'),
        )
    }
    if (!options.toWorkspace && !options.toPersonal) {
        throw new Error(
            formatError('MISSING_DESTINATION', 'Specify --to-workspace <ref> or --to-personal.'),
        )
    }
    if (options.folder && !options.toWorkspace) {
        throw new Error(
            formatError('INVALID_OPTIONS', '--folder is only valid with --to-workspace.'),
        )
    }
    if (options.visibility && !options.toWorkspace) {
        throw new Error(
            formatError('INVALID_OPTIONS', '--visibility is only valid with --to-workspace.'),
        )
    }
    if (
        options.visibility &&
        !validVisibilities.includes(options.visibility as ProjectVisibility)
    ) {
        throw new Error(
            formatError('INVALID_VISIBILITY', `Invalid visibility "${options.visibility}".`, [
                `Valid values: ${validVisibilities.join(', ')}`,
            ]),
        )
    }

    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (options.toWorkspace) {
        const workspace = await resolveWorkspaceRef(options.toWorkspace)

        if (isWorkspaceProject(project) && project.workspaceId === workspace.id) {
            throw new Error(
                formatError(
                    'SAME_WORKSPACE',
                    `Project "${project.name}" is already in workspace "${workspace.name}".`,
                ),
            )
        }

        const args: MoveProjectToWorkspaceArgs = {
            projectId: project.id,
            workspaceId: workspace.id,
        }

        let folderName: string | undefined
        if (options.folder) {
            const folder = await resolveFolderRef(options.folder, workspace.id)
            args.folderId = folder.id
            folderName = folder.name
        }

        if (options.visibility) {
            args.access = { visibility: options.visibility as ProjectVisibility }
        }

        if (options.dryRun || !options.yes) {
            let preview = `Would move "${project.name}" to workspace "${workspace.name}"`
            if (folderName) {
                preview += ` (folder: ${folderName})`
            }
            if (options.visibility) {
                preview += ` (visibility: ${options.visibility})`
            }
            console.log(preview)
            if (!options.dryRun) console.log('Use --yes to confirm.')
            return
        }

        await api.moveProjectToWorkspace(args)

        let output = `Moved "${project.name}" to workspace "${workspace.name}"`
        if (folderName) {
            output += ` (folder: ${folderName})`
        }
        console.log(output)
    } else {
        if (isPersonalProject(project)) {
            throw new Error(
                formatError(
                    'ALREADY_PERSONAL',
                    `Project "${project.name}" is already a personal project.`,
                ),
            )
        }

        if (options.dryRun || !options.yes) {
            console.log(`Would move "${project.name}" to personal`)
            if (!options.dryRun) console.log('Use --yes to confirm.')
            return
        }

        await api.moveProjectToPersonal({ projectId: project.id })
        console.log(`Moved "${project.name}" to personal`)
    }
}

async function archivedCount(options: {
    workspace?: string
    joined?: boolean
    json?: boolean
}): Promise<void> {
    const api = await getApi()

    const args: { workspaceId?: number; joined?: boolean } = {}
    let workspaceName: string | undefined
    if (options.workspace) {
        const workspace = await resolveWorkspaceRef(options.workspace)
        args.workspaceId = parseInt(workspace.id, 10)
        workspaceName = workspace.name
    }
    if (options.joined) {
        args.joined = true
    }

    const result = await api.getArchivedProjectsCount(args)

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    let output = `Archived projects: ${result.count}`
    if (workspaceName) {
        output += ` (workspace: ${workspaceName})`
    }
    console.log(output)
}

async function showPermissions(options: { json?: boolean }): Promise<void> {
    const api = await getApi()
    const result = await api.getProjectPermissions()

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    if (result.projectCollaboratorActions.length > 0) {
        console.log(chalk.bold('Project Collaborator Roles'))
        console.log('')
        for (const role of result.projectCollaboratorActions) {
            console.log(`  ${chalk.bold(role.name)}`)
            for (const action of role.actions) {
                console.log(`    ${action.name}`)
            }
        }
    }

    if (result.workspaceCollaboratorActions.length > 0) {
        if (result.projectCollaboratorActions.length > 0) {
            console.log('')
        }
        console.log(chalk.bold('Workspace Collaborator Roles'))
        console.log('')
        for (const role of result.workspaceCollaboratorActions) {
            console.log(`  ${chalk.bold(role.name)}`)
            for (const action of role.actions) {
                console.log(`    ${action.name}`)
            }
        }
    }
}

async function joinProjectCmd(
    ref: string,
    options: { json?: boolean; dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(ref, 'project')

    if (options.dryRun) {
        printDryRun('join project', { ID: id })
        return
    }

    const api = await getApi()
    const project = await api.joinProject(id)

    if (options.json) {
        console.log(formatJson(project, 'project'))
        return
    }

    console.log(`Joined: ${project.name}`)
    console.log(chalk.dim(`ID: ${project.id}`))
}

async function showProjectProgress(ref: string, options: { json?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    const progress = await api.getProjectProgress(project.id)

    if (options.json) {
        console.log(JSON.stringify(progress, null, 2))
        return
    }

    const total = progress.completedCount + progress.activeCount
    console.log(chalk.bold(project.name))
    console.log('')
    console.log(
        `Progress: ${formatProgressBar(progress.progressPercent)} (${progress.completedCount}/${total})`,
    )
    console.log(`  Completed: ${progress.completedCount}`)
    console.log(`  Active:    ${progress.activeCount}`)
}

async function showProjectHealth(ref: string, options: { json?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    const health = await api.getProjectHealth(project.id)

    if (options.json) {
        console.log(JSON.stringify(health, null, 2))
        return
    }

    console.log(chalk.bold(project.name))
    console.log('')

    let statusLine = `Health: ${formatHealthStatus(health.status)}`
    if (health.isStale) {
        statusLine += chalk.dim("  (stale - run 'td project analyze-health' to refresh)")
    }
    if (health.updateInProgress) {
        statusLine += chalk.dim('  (analysis in progress...)')
    }
    console.log(statusLine)

    if (health.updatedAt) {
        console.log(`  Updated: ${health.updatedAt}`)
    }

    if (health.description) {
        console.log('')
        console.log('  Summary:')
        console.log(`  ${health.description}`)
    }

    if (health.taskRecommendations && health.taskRecommendations.length > 0) {
        console.log('')
        console.log('  Recommendations:')
        for (const rec of health.taskRecommendations) {
            console.log(`  - ${chalk.dim(`id:${rec.taskId}`)}: ${rec.recommendation}`)
        }
    }
}

async function showProjectHealthContext(ref: string, options: { json?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    const context = await api.getProjectHealthContext(project.id)

    if (options.json) {
        console.log(JSON.stringify(context, null, 2))
        return
    }

    console.log(chalk.bold(context.projectName))
    console.log('')
    console.log('Metrics:')
    const projectMetrics = context.projectMetrics
    console.log(`  Total tasks:          ${projectMetrics.totalTasks}`)
    console.log(`  Completed:            ${projectMetrics.completedTasks}`)
    console.log(`  Overdue:              ${projectMetrics.overdueTasks}`)
    console.log(`  Created this week:    ${projectMetrics.tasksCreatedThisWeek}`)
    console.log(`  Completed this week:  ${projectMetrics.tasksCompletedThisWeek}`)
    if (projectMetrics.averageCompletionTime !== null) {
        console.log(
            `  Avg completion time:  ${projectMetrics.averageCompletionTime.toFixed(1)} days`,
        )
    }

    if (context.tasks.length > 0) {
        console.log('')
        console.log(chalk.dim(`--- Tasks (${context.tasks.length}) ---`))
        for (const task of context.tasks) {
            const parts = [chalk.dim(`id:${task.id}`)]
            parts.push(`p${5 - parseInt(task.priority, 10)}`)
            if (task.due) parts.push(chalk.green(`due:${task.due}`))
            if (task.deadline) parts.push(chalk.red(`deadline:${task.deadline}`))
            if (task.isCompleted) parts.push(chalk.dim('[done]'))
            if (task.labels.length > 0) parts.push(chalk.cyan(task.labels.join(', ')))
            console.log(`  ${task.content}`)
            console.log(`  ${parts.join('  ')}`)
            console.log('')
        }
    }
}

async function showProjectActivityStats(
    ref: string,
    options: { json?: boolean; weeks?: string; includeWeekly?: boolean },
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const args: GetProjectActivityStatsArgs = {}
    if (options.weeks) args.weeks = parseInt(options.weeks, 10)
    if (options.includeWeekly) args.includeWeeklyCounts = true

    const stats = await api.getProjectActivityStats(project.id, args)

    if (options.json) {
        console.log(JSON.stringify(stats, null, 2))
        return
    }

    console.log(chalk.bold(`${project.name} - Activity Stats`))

    if (stats.dayItems.length > 0) {
        console.log('')
        console.log('Daily:')
        for (const day of stats.dayItems) {
            const count = String(day.totalCount).padStart(4)
            console.log(`  ${day.date}  ${count} items`)
        }
    }

    if (stats.weekItems && stats.weekItems.length > 0) {
        console.log('')
        console.log('Weekly:')
        for (const week of stats.weekItems) {
            const count = String(week.totalCount).padStart(4)
            console.log(`  ${week.fromDate} to ${week.toDate}  ${count} items`)
        }
    }
}

async function analyzeHealth(
    ref: string,
    options: { json?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (options.dryRun) {
        printDryRun('trigger health analysis', { Project: project.name })
        return
    }

    const health = await api.analyzeProjectHealth(project.id)

    if (options.json) {
        console.log(JSON.stringify(health, null, 2))
        return
    }

    console.log(`Triggered health analysis for "${project.name}"`)
    console.log(
        chalk.dim(
            `Analysis is in progress. Run 'td project health "${project.name}"' to check results.`,
        ),
    )
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
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--detailed', 'Include sections, collaborators, notes, and comment count')
        .option('--show-urls', 'Show web app URLs for each task')
        .action((ref, options) => {
            if (!ref) {
                project.help()
                return
            }
            return viewProject(ref, options)
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
        .option('--dry-run', 'Preview what would happen without executing')
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
        .option('--json', 'Output the created project as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
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
        .option('--json', 'Output the updated project as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
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
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                archiveCmd.help()
                return
            }
            return archiveProject(ref, options)
        })

    const unarchiveCmd = project
        .command('unarchive [ref]')
        .description('Unarchive a project')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                unarchiveCmd.help()
                return
            }
            return unarchiveProject(ref, options)
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

    const moveCmd = project
        .command('move [ref]')
        .description('Move project between personal and workspace')
        .option('--to-workspace <ref>', 'Target workspace (name or id:xxx)')
        .option('--to-personal', 'Move to personal')
        .option('--folder <ref>', 'Target folder in workspace (name or id:xxx)')
        .option('--visibility <level>', 'Access visibility (restricted, team, public)')
        .option('--yes', 'Confirm move')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                moveCmd.help()
                return
            }
            return moveProject(ref, options)
        })

    project
        .command('archived-count')
        .description('Count archived projects')
        .option('--workspace <ref>', 'Filter to a workspace (name or id:xxx)')
        .option('--joined', 'Count only joined projects')
        .option('--json', 'Output as JSON')
        .action(archivedCount)

    project
        .command('permissions')
        .description('Show project permission mappings by role')
        .option('--json', 'Output as JSON')
        .action(showPermissions)

    const joinCmd = project
        .command('join [ref]')
        .description('Join a shared project')
        .option('--json', 'Output the joined project as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                joinCmd.help()
                return
            }
            return joinProjectCmd(ref, options)
        })

    const progressCmd = project
        .command('progress [ref]')
        .description('Show project completion progress')
        .option('--json', 'Output as JSON')
        .action((ref, options) => {
            if (!ref) {
                progressCmd.help()
                return
            }
            return showProjectProgress(ref, options)
        })

    const healthCmd = project
        .command('health [ref]')
        .description('Show project health status and recommendations')
        .option('--json', 'Output as JSON')
        .action((ref, options) => {
            if (!ref) {
                healthCmd.help()
                return
            }
            return showProjectHealth(ref, options)
        })

    const healthContextCmd = project
        .command('health-context [ref]')
        .description('Show detailed project metrics and task breakdown for health analysis')
        .option('--json', 'Output as JSON')
        .action((ref, options) => {
            if (!ref) {
                healthContextCmd.help()
                return
            }
            return showProjectHealthContext(ref, options)
        })

    const activityStatsCmd = project
        .command('activity-stats [ref]')
        .description('Show project activity statistics')
        .option('--json', 'Output as JSON')
        .option('--weeks <n>', 'Number of weeks of data (1-12)')
        .option('--include-weekly', 'Include weekly rollup counts')
        .action((ref, options) => {
            if (!ref) {
                activityStatsCmd.help()
                return
            }
            return showProjectActivityStats(ref, options)
        })

    const analyzeHealthCmd = project
        .command('analyze-health [ref]')
        .description('Trigger a new health analysis for a project')
        .option('--json', 'Output as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                analyzeHealthCmd.help()
                return
            }
            return analyzeHealth(ref, options)
        })
}

import { isWorkspaceProject, type PersonalProject, type TodoistApi } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi, type Project } from '../../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces } from '../../lib/api/workspaces.js'
import {
    buildProjectChildren,
    type ChildrenResult,
    type ProjectChild,
    resolveChildren,
} from '../../lib/children.js'
import { formatUserShortName } from '../../lib/collaborators.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { ViewOptions } from '../../lib/options.js'
import {
    formatChildrenBlock,
    formatJson,
    formatNdjson,
    formatTaskRow,
    processChildrenJson,
    processJsonItem,
} from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { projectUrl } from '../../lib/urls.js'
import { loadPersonalProjects } from './helpers.js'

async function printDescription(description: string | undefined, raw: boolean): Promise<void> {
    if (!description) return
    console.log('')
    console.log('Description:')
    console.log(raw ? description : await renderMarkdown(description))
}

function printParent(parentProject: Project | undefined): void {
    if (!parentProject) return
    console.log(`Parent:   ${parentProject.name} (id:${parentProject.id})`)
}

function printChildren(
    children: ChildrenResult<ProjectChild> | undefined,
    projectId: string,
): void {
    if (!children) return
    for (const line of formatChildrenBlock(children, 'project', projectId)) {
        console.log(line)
    }
}

/**
 * The project record plus one record per sub-project, for `--ndjson`. The summary
 * — count, truncation, lookup failure — rides on the project record, because the
 * children go out as their own lines and would otherwise be indistinguishable
 * from "no sub-projects".
 */
function projectNdjsonLines(
    project: Project,
    children: ChildrenResult<ProjectChild> | undefined,
    options: ViewOptions,
): string[] {
    if (!children) {
        return [formatNdjson([project], 'project', options.full, options.showUrls)]
    }
    const { children: childRecords = [], ...summary } = processChildrenJson(
        children,
        'project',
        options.full,
        options.showUrls,
    )
    const record = {
        ...processJsonItem(project, 'project', options.full ?? false, options.showUrls),
        ...summary,
    }
    const lines = [formatNdjson([record])]
    if (childRecords.length > 0) lines.push(formatNdjson(childRecords))
    return lines
}

/**
 * Names the parent project, reusing the already-loaded hierarchy when there is
 * one. Only the human-readable paths render it, so only they should pay for it.
 */
async function resolveParentProject(
    api: TodoistApi,
    project: Project,
    allPersonal: PersonalProject[] | undefined,
): Promise<Project | undefined> {
    if (isWorkspaceProject(project) || !project.parentId) return undefined
    const parentId = project.parentId
    return allPersonal?.find((p) => p.id === parentId) ?? (await api.getProject(parentId))
}

export async function viewProject(
    ref: string,
    options: ViewOptions & { detailed?: boolean; includeChildren?: boolean } = {},
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    let allPersonal: PersonalProject[] | undefined
    // Started rather than awaited: paginating the project tree is independent of
    // the project's own tasks, so the two run together.
    const childrenRequest: Promise<ChildrenResult<ProjectChild>> | undefined =
        options.includeChildren
            ? isWorkspaceProject(project)
                ? Promise.resolve({ childCount: 0, children: [] })
                : resolveChildren(async () => {
                      allPersonal = await loadPersonalProjects(api)
                      return buildProjectChildren(project, allPersonal)
                  })
            : undefined

    if (options.detailed) {
        const [fullData, children] = await Promise.all([
            api.getFullProject(project.id),
            childrenRequest,
        ])

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
                ...(children
                    ? processChildrenJson(children, 'project', options.full, options.showUrls)
                    : {}),
            }
            console.log(JSON.stringify(output, null, 2))
            return
        }

        if (options.ndjson) {
            const lines: string[] = []
            if (fullData.project) {
                lines.push(...projectNdjsonLines(fullData.project, children, options))
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
        printParent(await resolveParentProject(api, project, allPersonal))

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
        printChildren(children, displayProject.id)

        await printDescription(displayProject.description, options.raw ?? false)

        if (fullData.tasks.length > 0) {
            console.log('')
            console.log(chalk.dim(`--- Tasks (${fullData.tasks.length}) ---`))
            for (const task of fullData.tasks) {
                console.log(
                    await formatTaskRow({ task, showUrl: options.showUrls, raw: options.raw }),
                )
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
        const children = await childrenRequest
        if (!children) {
            console.log(formatJson(project, 'project', options.full, options.showUrls))
            return
        }
        console.log(
            formatJson({
                ...processJsonItem(project, 'project', options.full ?? false, options.showUrls),
                ...processChildrenJson(children, 'project', options.full, options.showUrls),
            }),
        )
        return
    }

    const [{ results: tasks }, children] = await Promise.all([
        api.getTasks({ projectId: project.id }),
        childrenRequest,
    ])

    if (options.ndjson) {
        const lines: string[] = []
        lines.push(...projectNdjsonLines(project, children, options))
        if (tasks.length > 0) {
            lines.push(formatNdjson(tasks, 'task', options.full, options.showUrls))
        }
        console.log(lines.join('\n'))
        return
    }

    console.log(chalk.bold(project.name))
    console.log('')
    console.log(`ID:       ${project.id}`)
    printParent(await resolveParentProject(api, project, allPersonal))

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
    printChildren(children, project.id)

    await printDescription(project.description, options.raw ?? false)

    if (tasks.length > 0) {
        console.log('')
        console.log(chalk.dim(`--- Tasks (${tasks.length}) ---`))
        for (const task of tasks) {
            console.log(await formatTaskRow({ task, showUrl: options.showUrls, raw: options.raw }))
            console.log('')
        }
    }
}

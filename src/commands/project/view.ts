import { isWorkspaceProject, type PersonalProject } from '@doist/todoist-sdk'
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

/** The already-projected sub-project records for `--ndjson`, if any were requested. */
function childNdjsonRecords(
    children: ChildrenResult<ProjectChild> | undefined,
    options: ViewOptions,
): object[] {
    if (!children) return []
    const records = processChildrenJson(
        children,
        'project',
        options.full,
        options.showUrls,
    ).children
    return (records as object[] | undefined) ?? []
}

export async function viewProject(
    ref: string,
    options: ViewOptions & { detailed?: boolean; includeChildren?: boolean } = {},
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    let allPersonal: PersonalProject[] | undefined
    let children: ChildrenResult<ProjectChild> | undefined
    if (options.includeChildren) {
        children = isWorkspaceProject(project)
            ? { childCount: 0, children: [] }
            : await resolveChildren(async () => {
                  allPersonal = await loadPersonalProjects(api)
                  return buildProjectChildren(project, allPersonal)
              })
    }

    // Free when the children lookup already loaded the list; one cheap call otherwise.
    let parentProject: Project | undefined
    if (!isWorkspaceProject(project) && project.parentId) {
        const parentId = project.parentId
        parentProject =
            allPersonal?.find((p) => p.id === parentId) ?? (await api.getProject(parentId))
    }

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
                lines.push(
                    formatNdjson([fullData.project], 'project', options.full, options.showUrls),
                )
            }
            const childRecords = childNdjsonRecords(children, options)
            if (childRecords.length > 0) {
                lines.push(formatNdjson(childRecords))
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
        printParent(parentProject)

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

    const { results: tasks } = await api.getTasks({ projectId: project.id })

    if (options.ndjson) {
        const lines: string[] = []
        lines.push(formatNdjson([project], 'project', options.full, options.showUrls))
        const childRecords = childNdjsonRecords(children, options)
        if (childRecords.length > 0) {
            lines.push(formatNdjson(childRecords))
        }
        if (tasks.length > 0) {
            lines.push(formatNdjson(tasks, 'task', options.full, options.showUrls))
        }
        console.log(lines.join('\n'))
        return
    }

    console.log(chalk.bold(project.name))
    console.log('')
    console.log(`ID:       ${project.id}`)
    printParent(parentProject)

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

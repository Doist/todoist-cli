import { isWorkspaceProject } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces } from '../../lib/api/workspaces.js'
import { formatUserShortName } from '../../lib/collaborators.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson, formatTaskRow } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { projectUrl } from '../../lib/urls.js'

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

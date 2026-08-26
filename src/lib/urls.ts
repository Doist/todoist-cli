import {
    getFilterUrl,
    getLabelUrl,
    getProjectCommentUrl,
    getProjectUrl,
    getSectionUrl,
    getTaskCommentUrl,
    getTaskUrl,
} from '@doist/todoist-sdk'

/**
 * Todoist web links.
 *
 * These delegate to the SDK, which is the shared source of the URL rules, so
 * links stay in step with the other Todoist clients. Only links the SDK has no
 * builder for are assembled here.
 */

const BASE_URL = 'https://app.todoist.com/app'

export function taskUrl(taskId: string): string {
    return getTaskUrl(taskId)
}

export function projectUrl(projectId: string): string {
    return getProjectUrl(projectId)
}

export function labelUrl(labelId: string): string {
    return getLabelUrl(labelId)
}

export function filterUrl(filterId: string): string {
    return getFilterUrl(filterId)
}

export function sectionUrl(sectionId: string): string {
    return getSectionUrl(sectionId)
}

export function appInstallUrl(distributionToken: string): string {
    return `${BASE_URL}/install/${distributionToken}`
}

export function commentUrl(taskId: string, commentId: string): string {
    return getTaskCommentUrl(taskId, commentId)
}

export function projectCommentUrl(projectId: string, commentId: string): string {
    return getProjectCommentUrl(projectId, commentId)
}

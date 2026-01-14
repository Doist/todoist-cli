const BASE_URL = 'https://app.todoist.com/app'

type EntityPath = 'task' | 'project' | 'label' | 'filter' | 'section'

function entityUrl(path: EntityPath, id: string): string {
  return `${BASE_URL}/${path}/${id}`
}

export function taskUrl(taskId: string): string {
  return entityUrl('task', taskId)
}

export function projectUrl(projectId: string): string {
  return entityUrl('project', projectId)
}

export function labelUrl(labelId: string): string {
  return entityUrl('label', labelId)
}

export function filterUrl(filterId: string): string {
  return entityUrl('filter', filterId)
}

export function sectionUrl(sectionId: string): string {
  return entityUrl('section', sectionId)
}

export function commentUrl(taskId: string, commentId: string): string {
  return `${entityUrl('task', taskId)}#comment-${commentId}`
}

export function projectCommentUrl(
  projectId: string,
  commentId: string
): string {
  return `${entityUrl('project', projectId)}/comments#comment-${commentId}`
}

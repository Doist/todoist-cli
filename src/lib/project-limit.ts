import type { TodoistApi } from '@doist/todoist-sdk'
import { CliError } from './errors.js'

export const PROJECT_LIMIT_HINT =
    'Archive or delete a personal project, or upgrade your plan, then try again.'

/**
 * Throws `PROJECT_LIMIT_REACHED` unless the user's plan has room for another active
 * personal project. Call it before creating, unarchiving or moving a project to
 * personal.
 *
 * The API accepts a couple of projects past the plan limit so offline clients can
 * sync at the boundary, so it does not refuse these writes itself; the Todoist apps
 * check the real limit first, and so does the CLI.
 */
export async function ensurePersonalProjectCapacity(api: TodoistApi): Promise<void> {
    const { maxProjects, remaining } = await api.getPersonalProjectCapacity()
    if (remaining === 0) {
        throw new CliError(
            'PROJECT_LIMIT_REACHED',
            `You have reached the limit of ${maxProjects} active personal projects on your plan.`,
            [PROJECT_LIMIT_HINT],
        )
    }
}

import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'

export async function showPermissions(options: { json?: boolean }): Promise<void> {
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

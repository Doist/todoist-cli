import chalk from 'chalk'
import { resolveWorkspaceRef } from '../../lib/refs.js'

export async function viewWorkspace(ref: string): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)

    console.log(chalk.bold(workspace.name))
    console.log('')
    console.log(`ID:       ${workspace.id}`)
    console.log(`Plan:     ${workspace.plan}`)
    if (workspace.role) {
        console.log(`Role:     ${workspace.role}`)
    }
    if (workspace.domainName) {
        console.log(`Domain:   ${workspace.domainName}`)
    }
    const { adminCount, memberCount, guestCount } = workspace.memberCountByType
    console.log(
        `Members:  ${workspace.currentMemberCount} (${adminCount} admins, ${memberCount} members, ${guestCount} guests)`,
    )
    console.log(`Projects: ${workspace.currentActiveProjects} active`)
}

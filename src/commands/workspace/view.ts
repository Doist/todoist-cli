import chalk from 'chalk'
import { resolveWorkspaceRef } from '../../lib/refs.js'

export async function viewWorkspace(
    ref: string,
    options: { json?: boolean; full?: boolean } = {},
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)

    if (options.json) {
        const output = options.full
            ? workspace
            : {
                  id: workspace.id,
                  name: workspace.name,
                  plan: workspace.plan,
                  role: workspace.role,
                  domainName: workspace.domainName,
                  memberCount: workspace.currentMemberCount,
                  projectCount: workspace.currentActiveProjects,
              }
        console.log(JSON.stringify(output, null, 2))
        return
    }

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

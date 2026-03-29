import chalk from 'chalk'
import { fetchWorkspaces } from '../../lib/api/workspaces.js'
import type { PaginatedViewOptions } from '../../lib/options.js'

export async function listWorkspaces(options: PaginatedViewOptions): Promise<void> {
    const workspaces = await fetchWorkspaces()

    if (workspaces.length === 0) {
        return
    }

    if (options.json) {
        const output = options.full
            ? workspaces
            : workspaces.map((w) => ({
                  id: w.id,
                  name: w.name,
                  plan: w.plan,
                  role: w.role,
                  memberCount: w.currentMemberCount,
                  projectCount: w.currentActiveProjects,
              }))
        console.log(JSON.stringify({ results: output, nextCursor: null }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const w of workspaces) {
            const output = options.full
                ? w
                : {
                      id: w.id,
                      name: w.name,
                      plan: w.plan,
                      role: w.role,
                      memberCount: w.currentMemberCount,
                      projectCount: w.currentActiveProjects,
                  }
            console.log(JSON.stringify(output))
        }
        return
    }

    for (const w of workspaces) {
        const id = chalk.dim(`id:${w.id}`)
        const name = w.name
        const plan = chalk.cyan(`(${w.plan})`)
        const stats = chalk.dim(
            `${w.currentMemberCount} members, ${w.currentActiveProjects} projects`,
        )
        const role = chalk.yellow(`[${w.role}]`)
        console.log(`${id}  ${name} ${plan} - ${stats} ${role}`)
    }
}

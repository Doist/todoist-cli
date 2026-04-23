import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { formatNextCursorFooter } from '../../lib/output.js'
import { paginate } from '../../lib/pagination.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

export async function listFolders(
    ref: string | undefined,
    options: PaginatedViewOptions,
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : 300

    const { results: folders, nextCursor } = await paginate(
        (cursor, limit) =>
            api.getFolders({
                workspaceId: workspace.id,
                cursor: cursor ?? undefined,
                limit,
            }),
        { limit: targetLimit, startCursor: options.cursor },
    )

    if (options.json) {
        console.log(JSON.stringify({ results: folders, nextCursor }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const folder of folders) {
            console.log(JSON.stringify(folder))
        }
        if (nextCursor) {
            console.log(JSON.stringify({ _meta: true, nextCursor }))
        }
        return
    }

    if (folders.length === 0) {
        console.log('No folders found.')
        return
    }

    for (const folder of folders) {
        const id = chalk.dim(folder.id)
        console.log(`${id}  ${folder.name}`)
    }
    console.log(formatNextCursorFooter(nextCursor))
}

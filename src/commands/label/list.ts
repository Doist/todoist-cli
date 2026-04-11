import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { isAccessible } from '../../lib/global-args.js'
import type { PaginatedViewOptions } from '../../lib/options.js'

export interface ListLabelsOptions extends PaginatedViewOptions {
    search?: string
}
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { labelUrl } from '../../lib/urls.js'

export async function listLabels(options: ListLabelsOptions): Promise<void> {
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.labels

    const { results: labels, nextCursor } = await paginate(
        (cursor, limit) =>
            options.search
                ? api.searchLabels({ query: options.search, cursor: cursor ?? undefined, limit })
                : api.getLabels({ cursor: cursor ?? undefined, limit }),
        { limit: targetLimit },
    )

    // Fetch shared-only labels (not in personal labels) — skip when searching
    // since searchLabels only covers personal labels
    const sharedLabels: string[] = options.search
        ? []
        : (
              await paginate(
                  (cursor, limit) =>
                      api.getSharedLabels({
                          omitPersonal: true,
                          cursor: cursor ?? undefined,
                          limit,
                      }),
                  { limit: targetLimit },
              )
          ).results

    if (options.json) {
        const base = JSON.parse(
            formatPaginatedJson(
                { results: labels, nextCursor },
                'label',
                options.full,
                options.showUrls,
            ),
        )
        base.sharedLabels = sharedLabels
        console.log(JSON.stringify(base, null, 2))
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: labels, nextCursor },
                'label',
                options.full,
                options.showUrls,
            ),
        )
        for (const name of sharedLabels) {
            console.log(JSON.stringify({ _type: 'sharedLabel', name }))
        }
        return
    }

    if (labels.length === 0 && sharedLabels.length === 0) {
        console.log('No labels found.')
        return
    }

    for (const label of labels) {
        const id = chalk.dim(label.id)
        const name = label.isFavorite
            ? chalk.yellow(`@${label.name}${isAccessible() ? ' ★' : ''}`)
            : `@${label.name}`
        console.log(`${id}  ${name}`)
        if (options.showUrls) {
            console.log(`  ${chalk.dim(labelUrl(label.id))}`)
        }
    }

    for (const name of sharedLabels) {
        console.log(`${chalk.dim('(shared)')}  @${name}`)
    }

    console.log(formatNextCursorFooter(nextCursor))
}

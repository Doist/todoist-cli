import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { resolveProjectId } from '../../lib/refs.js'
import { sectionUrl } from '../../lib/urls.js'

type ListSectionOptions = PaginatedViewOptions & { project?: string; search?: string }

export async function listSections(
    projectRef: string | undefined,
    options: ListSectionOptions,
): Promise<void> {
    const api = await getApi()

    let projectId: string | undefined
    if (projectRef) {
        projectId = await resolveProjectId(api, projectRef)
    }

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.sections

    const { results: sections, nextCursor } = await paginate(
        (cursor, limit) =>
            options.search
                ? api.searchSections({
                      query: options.search,
                      projectId: projectId ?? undefined,
                      cursor: cursor ?? undefined,
                      limit,
                  })
                : api.getSections({ projectId: projectId!, cursor: cursor ?? undefined, limit }),
        { limit: targetLimit },
    )

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: sections, nextCursor },
                'section',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: sections, nextCursor },
                'section',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (sections.length === 0) {
        console.log('No sections.')
        return
    }

    for (const section of sections) {
        const id = chalk.dim(section.id)
        console.log(`${id}  ${section.name}`)
        if (options.showUrls) {
            console.log(`  ${chalk.dim(sectionUrl(section.id))}`)
        }
    }
    console.log(formatNextCursorFooter(nextCursor))
}

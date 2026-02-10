import { getLogger } from './logger.js'

export interface PaginatedResult<T> {
    results: T[]
    nextCursor: string | null
}

export interface PaginateOptions {
    limit: number
    perPage?: number
    startCursor?: string
}

type FetchPage<T> = (
    cursor: string | null,
    limit: number,
) => Promise<{ results: T[]; nextCursor: string | null }>

export async function paginate<T>(
    fetchPage: FetchPage<T>,
    options: PaginateOptions,
): Promise<PaginatedResult<T>> {
    const { limit, perPage = 200, startCursor } = options
    const all: T[] = []
    let cursor: string | null = startCursor ?? null
    const logger = getLogger()
    let pageNum = 0

    logger.detail('paginate started', { limit, perPage, startCursor: startCursor ?? null })

    while (all.length < limit) {
        const remaining = limit - all.length
        const pageSize = Math.min(remaining, perPage)
        pageNum++

        logger.detail(`paginate page ${pageNum}`, {
            page_size: pageSize,
            cursor: cursor ?? '(initial)',
            accumulated: all.length,
        })

        const startTime = performance.now()
        const response = await fetchPage(cursor, pageSize)
        const durationMs = Math.round(performance.now() - startTime)

        logger.detail(`paginate page ${pageNum} done`, {
            results: response.results.length,
            has_more: Boolean(response.nextCursor),
            duration_ms: durationMs,
        })

        all.push(...response.results)
        cursor = response.nextCursor

        if (!cursor) break
    }

    logger.detail('paginate complete', {
        total_results: Math.min(all.length, limit),
        pages_fetched: pageNum,
        has_more: Boolean(cursor),
    })

    return {
        results: all.slice(0, limit),
        nextCursor: cursor,
    }
}

export const LIMITS = {
    tasks: 300,
    projects: 50,
    sections: 300,
    labels: 300,
    comments: 10,
} as const

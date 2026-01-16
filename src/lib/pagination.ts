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

    while (all.length < limit) {
        const remaining = limit - all.length
        const pageSize = Math.min(remaining, perPage)

        const response = await fetchPage(cursor, pageSize)
        all.push(...response.results)
        cursor = response.nextCursor

        if (!cursor) break
    }

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

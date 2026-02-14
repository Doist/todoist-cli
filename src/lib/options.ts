export type ViewOptions = {
    json?: boolean
    full?: boolean
    raw?: boolean
}

export type PaginatedViewOptions = ViewOptions & {
    limit?: string
    cursor?: string
    all?: boolean
    ndjson?: boolean
    showUrls?: boolean
}

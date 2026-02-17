export type ViewOptions = {
    json?: boolean
    ndjson?: boolean
    full?: boolean
    raw?: boolean
    showUrls?: boolean
}

export type PaginatedViewOptions = ViewOptions & {
    limit?: string
    cursor?: string
    all?: boolean
}

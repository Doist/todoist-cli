import type { ViewOptions as CoreViewOptions } from '@doist/cli-core'

export type ViewOptions = CoreViewOptions & {
    full?: boolean
    raw?: boolean
    showUrls?: boolean
}

export type Pagination = {
    limit?: string
    cursor?: string
}

export type PaginatedViewOptions = ViewOptions &
    Pagination & {
        all?: boolean
    }

export type DryRunOption = {
    dryRun?: boolean
}

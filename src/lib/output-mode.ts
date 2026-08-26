import { CliError } from './errors.js'

/** Supported CLI output modes. */
export const OUTPUT_MODES = ['human', 'json', 'ndjson', 'ids-only', 'markdown'] as const

/** A supported CLI output mode. */
export type OutputMode = (typeof OUTPUT_MODES)[number]

export type OutputModeOptions = {
    idsOnly?: boolean
    json?: boolean
    markdown?: boolean
    ndjson?: boolean
}

const OUTPUT_FLAGS: ReadonlyArray<{
    enabled: (options: OutputModeOptions) => boolean
    flag: string
    mode: OutputMode
}> = [
    { enabled: (options) => Boolean(options.json), flag: '--json', mode: 'json' },
    { enabled: (options) => Boolean(options.ndjson), flag: '--ndjson', mode: 'ndjson' },
    { enabled: (options) => Boolean(options.idsOnly), flag: '--ids-only', mode: 'ids-only' },
    { enabled: (options) => Boolean(options.markdown), flag: '--markdown', mode: 'markdown' },
]

export function resolveOutputMode(options: OutputModeOptions): OutputMode {
    const selected = OUTPUT_FLAGS.filter(({ enabled }) => enabled(options))
    if (selected.length > 1) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            `Options ${selected.map(({ flag }) => flag).join(', ')} are mutually exclusive.`,
        )
    }
    return selected[0]?.mode ?? 'human'
}

import {
    OUTPUT_MODES as CORE_OUTPUT_MODES,
    type ListViewOptions,
    resolveOutputMode as resolveCoreOutputMode,
} from '@doist/cli-core'
import { CliError } from './errors.js'

/** Supported CLI output modes. */
export const OUTPUT_MODES = [...CORE_OUTPUT_MODES, 'markdown'] as const

/** A supported CLI output mode. */
export type OutputMode = (typeof OUTPUT_MODES)[number]

export type OutputModeOptions = ListViewOptions & {
    markdown?: boolean
}

export function resolveOutputMode(options: OutputModeOptions): OutputMode {
    if (options.markdown) {
        const conflictingFlags = [
            options.json && '--json',
            options.ndjson && '--ndjson',
            options.idsOnly && '--ids-only',
        ].filter((flag): flag is string => Boolean(flag))
        if (conflictingFlags.length === 0) return 'markdown'
        throw new CliError(
            'CONFLICTING_OPTIONS',
            `Options ${[...conflictingFlags, '--markdown'].join(', ')} are mutually exclusive.`,
        )
    }
    return resolveCoreOutputMode(options)
}

import { createSpinner } from '@doist/cli-core'
import { shouldDisableSpinner } from './global-args.js'

export type { SpinnerOptions } from '@doist/cli-core'

/**
 * Todoist spinner kit. The CLI-specific bit is `shouldDisableSpinner` —
 * everything else (early-spinner singleton, adoption, withSpinner, the
 * LoadingSpinner class) lives in cli-core.
 */
const spinner = createSpinner({ isDisabled: shouldDisableSpinner })

export const { LoadingSpinner, withSpinner, startEarlySpinner, stopEarlySpinner } = spinner

/** @internal Test-only — exposed so the existing spinner test suite can fully reset state. */
export const resetEarlySpinner = spinner.resetEarlySpinner

import { CliError as BaseCliError, type CliErrorCode, type ErrorType } from '@doist/cli-core'

export type { ErrorType } from '@doist/cli-core'

/**
 * Known error codes used across the CLI.
 * This union provides intellisense suggestions while still accepting any string,
 * allowing dynamic codes (e.g., `${entity}_NOT_FOUND`) and future additions.
 */
export type ErrorCode =
    // Auth & permissions
    | 'AUTH_ERROR'
    | 'AUTH_FAILED'
    | 'INVALID_TOKEN'
    | 'NO_TOKEN'
    | 'READ_ONLY'
    | 'TOKEN_FROM_ENV'
    // API & network
    | 'API_ERROR'
    | 'INTERNAL_ERROR'
    | 'RATE_LIMITED'
    | 'REGISTRY_ERROR'
    | 'UPLOAD_FAILED'
    // Validation
    | 'CONFIRMATION_REQUIRED'
    | 'CONFLICTING_OPTIONS'
    | 'INVALID_AUTO_REMINDER'
    | 'INVALID_BOOLEAN'
    | 'INVALID_DATE'
    | 'INVALID_DATETIME'
    | 'INVALID_DATE_FORMAT'
    | 'INVALID_DAY'
    | 'INVALID_DURATION'
    | 'INVALID_GOAL'
    | 'INVALID_OPTIONS'
    | 'INVALID_ORDER'
    | 'INVALID_PRIORITY'
    | 'INVALID_REF'
    | 'INVALID_THEME'
    | 'INVALID_TIME_FORMAT'
    | 'INVALID_TYPE'
    | 'INVALID_URL'
    | 'INVALID_VISIBILITY'
    | 'INVALID_ROLE'
    | 'NOT_ADMIN'
    // Missing input
    | 'MISSING_CONTENT'
    | 'MISSING_DESTINATION'
    | 'MISSING_FILE'
    | 'MISSING_ID'
    | 'MISSING_INVITATION_DATA'
    | 'MISSING_NAME'
    | 'MISSING_TEMPLATE_ID'
    | 'MISSING_TIME'
    | 'MISSING_TYPE'
    // Not found
    | 'ASSIGNEE_NOT_FOUND'
    | 'FILTER_NOT_FOUND'
    | 'LABEL_NOT_FOUND'
    | 'NOT_FOUND'
    | 'NOTIFICATION_NOT_FOUND'
    | 'PARENT_NOT_FOUND'
    | 'PROJECT_NOT_FOUND'
    | 'SECTION_NOT_FOUND'
    | 'TASK_NOT_FOUND'
    | 'WORKSPACE_NOT_FOUND'
    | 'FOLDER_NOT_FOUND'
    // Ambiguous matches
    | 'AMBIGUOUS_ASSIGNEE'
    | 'AMBIGUOUS_FILTER'
    | 'AMBIGUOUS_FOLDER'
    | 'AMBIGUOUS_PROJECT'
    | 'AMBIGUOUS_SECTION'
    | 'AMBIGUOUS_TASK'
    | 'AMBIGUOUS_WORKSPACE'
    // State errors
    | 'ALREADY_EXISTS'
    | 'FETCH_FAILED'
    | 'FILE_NOT_FOUND'
    | 'FILE_READ_ERROR'
    | 'FILE_TOO_LARGE'
    | 'NO_CHANGES'
    | 'NO_DUE_DATE'
    | 'NO_DUE_TIME'
    | 'NO_URL'
    | 'NOT_INSTALLED'
    | 'NOT_SHARED'
    | 'PROJECT_ARCHIVED'
    | 'UNKNOWN_AGENT'
    // Escape hatch for dynamic codes
    | (string & {})

/**
 * Todoist-flavoured CliError that preserves the historical positional
 * `(code, message, hints?, type?)` signature used across hundreds of call
 * sites. Internally it forwards to the cli-core options-object form.
 *
 * `code` accepts the local todoist `ErrorCode` union plus any cli-core
 * canonical code (`CliErrorCode`), so call sites like
 * `new CliError('CONFIG_READ_FAILED', …)` still type-check without
 * `CONFIG_*` having to live in the local union.
 */
export class CliError extends BaseCliError<ErrorCode> {
    constructor(
        code: ErrorCode | CliErrorCode,
        message: string,
        hints?: string[],
        type: ErrorType = 'error',
    ) {
        super(code, message, { hints, type })
    }
}

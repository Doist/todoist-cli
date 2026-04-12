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
    // API & network
    | 'API_ERROR'
    | 'INTERNAL_ERROR'
    | 'RATE_LIMITED'
    | 'REGISTRY_ERROR'
    | 'UPLOAD_FAILED'
    // Validation
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

export type ErrorType = 'error' | 'info'

export class CliError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly hints?: string[],
        public readonly type: ErrorType = 'error',
    ) {
        super(message)
        this.name = 'CliError'
    }
}

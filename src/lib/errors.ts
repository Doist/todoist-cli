export class CliError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly hints?: string[],
    ) {
        super(message)
        this.name = 'CliError'
    }
}

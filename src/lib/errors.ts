export class CliError extends Error {
    constructor(
        public readonly code: string,
        public readonly userMessage: string,
        public readonly hints?: string[],
    ) {
        super(`${code}: ${userMessage}`)
        this.name = 'CliError'
    }
}

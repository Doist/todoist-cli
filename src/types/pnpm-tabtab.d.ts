declare module '@pnpm/tabtab' {
    type SupportedShell = 'bash' | 'fish' | 'pwsh' | 'zsh'

    interface CompletionItem {
        name: string
        description?: string
    }

    interface InstallOptions {
        name: string
        completer: string
        shell?: SupportedShell
    }

    interface UninstallOptions {
        name: string
        shell?: SupportedShell
    }

    interface ParseEnvResult {
        complete: boolean
        words: number
        point: number
        line: string
        partial: string
        last: string
        lastPartial: string
        prev: string
    }

    export const SUPPORTED_SHELLS: readonly SupportedShell[]
    export function install(options: InstallOptions): Promise<void>
    export function uninstall(options: UninstallOptions): Promise<void>
    export function parseEnv(env: Record<string, string | undefined>): ParseEnvResult
    export function log(
        args: Array<CompletionItem | string>,
        shell: SupportedShell,
        logToConsole?: (message: string) => void,
    ): void
    export function logFiles(): void
    export function isShellSupported(shell: string): shell is SupportedShell
    export function getShellFromEnv(env: Record<string, string | undefined>): SupportedShell
    export function getCompletionScript(options: {
        name: string
        completer: string
        shell: SupportedShell
    }): Promise<string>
}

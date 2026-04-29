import { Command } from 'commander'
import { CliError } from '../lib/errors.js'
import { classifyTodoistUrl } from '../lib/refs.js'
import { setActiveCommandPath } from '../lib/usage-tracking.js'

function looksLikeTodoistAppUrl(token: string): boolean {
    return /^https?:\/\/app\.todoist\.com\/app\/\S+/.test(token)
}

function extractViewInvocation(
    command: Command,
    parsedUrl: string,
    parsedArgs: string[],
): { url: string; passthroughArgs: string[] } {
    const parent = command.parent as (Command & { rawArgs?: string[] }) | null
    const rawArgs = parent?.rawArgs
    if (!rawArgs) return { url: parsedUrl, passthroughArgs: parsedArgs }

    const viewIndex = rawArgs.findIndex(
        (token: string, index: number) => index >= 2 && token === command.name(),
    )
    if (viewIndex === -1) return { url: parsedUrl, passthroughArgs: parsedArgs }

    const tokensAfterView = rawArgs.slice(viewIndex + 1)
    const urlIndex = tokensAfterView.findIndex((token: string) => looksLikeTodoistAppUrl(token))
    if (urlIndex === -1) return { url: parsedUrl, passthroughArgs: parsedArgs }

    return {
        url: tokensAfterView[urlIndex],
        passthroughArgs: [
            ...tokensAfterView.slice(0, urlIndex),
            ...tokensAfterView.slice(urlIndex + 1),
        ],
    }
}

async function runRoutedCommand(
    loadRegister: () => Promise<(program: Command) => void>,
    argv: string[],
    commandPath: string,
): Promise<void> {
    const proxy = new Command()
    proxy.exitOverride()
    const register = await loadRegister()
    register(proxy)
    // `src/index.ts` already recorded the top-level `view` command on the main
    // program. Override it here so downstream API requests are attributed to
    // the routed target command (`task.view`, `today`, etc.) instead.
    setActiveCommandPath(commandPath)
    await proxy.parseAsync(['node', 'td', ...argv])
}

export function registerViewCommand(program: Command): void {
    program
        .command('view <url> [args...]')
        .description('View a Todoist entity or page by URL')
        .allowUnknownOption(true)
        .addHelpText(
            'after',
            `
Route mapping:
  /app/task/...       -> td task view <ref>
  /app/project/...    -> td project view <ref>
  /app/label/...      -> td label view <ref>
  /app/filter/...     -> td filter show <ref>
  /app/today          -> td today
  /app/upcoming       -> td upcoming

Examples:
  td view https://app.todoist.com/app/task/buy-milk-abc123
  td view https://app.todoist.com/app/filter/work-tasks-def456 --json
  td view https://app.todoist.com/app/filter/work-tasks-def456 --limit 25 --ndjson`,
        )
        .action(async (url: string, args: string[], _options: unknown, command: Command) => {
            const invocation = extractViewInvocation(command, url, args)
            const route = classifyTodoistUrl(invocation.url)
            if (!route) {
                throw new CliError('INVALID_URL', `Not a recognized Todoist URL: ${invocation.url}`)
            }

            if (route.kind === 'view') {
                switch (route.view) {
                    case 'today':
                        return runRoutedCommand(
                            async () => (await import('./today.js')).registerTodayCommand,
                            ['today', ...invocation.passthroughArgs],
                            'today',
                        )
                    case 'upcoming':
                        return runRoutedCommand(
                            async () => (await import('./upcoming.js')).registerUpcomingCommand,
                            ['upcoming', ...invocation.passthroughArgs],
                            'upcoming',
                        )
                }
            }

            const ref = `id:${route.id}`
            switch (route.entityType) {
                case 'task':
                    return runRoutedCommand(
                        async () => (await import('./task/index.js')).registerTaskCommand,
                        ['task', 'view', ref, ...invocation.passthroughArgs],
                        'task.view',
                    )
                case 'project':
                    return runRoutedCommand(
                        async () => (await import('./project/index.js')).registerProjectCommand,
                        ['project', 'view', ref, ...invocation.passthroughArgs],
                        'project.view',
                    )
                case 'label':
                    return runRoutedCommand(
                        async () => (await import('./label/index.js')).registerLabelCommand,
                        ['label', 'view', ref, ...invocation.passthroughArgs],
                        'label.view',
                    )
                case 'filter':
                    return runRoutedCommand(
                        async () => (await import('./filter/index.js')).registerFilterCommand,
                        ['filter', 'show', ref, ...invocation.passthroughArgs],
                        'filter.show',
                    )
            }
        })
}

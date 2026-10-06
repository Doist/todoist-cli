import type { Command } from 'commander'

// These commands return no entity (or currently only print a confirmation).
// Give them a stable JSON success envelope while keeping their normal output.
const MUTATIONS_WITHOUT_JSON = new Set([
    'apps delete',
    'comment delete',
    'filter delete',
    'filter update',
    'folder delete',
    'label delete',
    'label rename-shared',
    'label remove-shared',
    'notification accept',
    'notification reject',
    'notification read',
    'notification unread',
    'project archive',
    'project delete',
    'project join',
    'project move',
    'project unarchive',
    'reminder delete',
    'reminder location delete',
    'section archive',
    'section delete',
    'section unarchive',
    'settings update',
    'skill update',
    'stats goals',
    'stats vacation',
    'task complete',
    'task delete',
    'task move',
    'task uncomplete',
    'workspace delete',
    'workspace use',
])

type ActionCommand = Command & { _actionHandler?: (args: unknown[]) => unknown }

export function enableMutationJson(program: Command): void {
    function visit(command: Command, parts: string[]): void {
        const path = [...parts, command.name()]
        if (MUTATIONS_WITHOUT_JSON.has(path.slice(1).join(' '))) {
            const action = command as ActionCommand
            const original = action._actionHandler
            if (original && !command.options.some((option) => option.long === '--json')) {
                command.option('--json', 'Output the result as JSON')
                action._actionHandler = async (args: unknown[]) => {
                    if (!command.optsWithGlobals().json) return original(args)

                    const originalLog = console.log
                    const messages: string[] = []
                    console.log = (...values: unknown[]) => {
                        messages.push(values.map(String).join(' '))
                    }
                    try {
                        await original(args)
                    } finally {
                        console.log = originalLog
                    }
                    originalLog(
                        JSON.stringify({
                            ok: true,
                            command: ['td', ...path.slice(1)].join(' '),
                            messages,
                        }),
                    )
                }
            }
        }
        for (const child of command.commands) visit(child, path)
    }
    visit(program, [])
}

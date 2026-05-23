import { attachAccountRemoveCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'

/**
 * Attach `td accounts remove <ref>` via cli-core's `attachAccountRemoveCommand`.
 *
 * `store.clear(ref)` resolves the ref and deletes by the canonical `account.id`
 * in one token-free step (so a record whose secret is unreadable stays
 * removable), returning the removed account plus whether it was the default — a
 * miss surfaces as `ACCOUNT_NOT_FOUND`. The Todoist hook surfaces the
 * keyring-fallback warning that the `TokenStore.clear` contract can't carry.
 */
export function attachTodoistUserRemoveCommand(parent: Command, store: TodoistTokenStore): Command {
    return attachAccountRemoveCommand<TodoistAccount>(parent, {
        store,
        description: 'Remove a stored account (deletes its token and config entry)',
        renderText: ({ account, wasDefault }) => {
            const lines = [`${chalk.green('✓')} Removed ${account.email ?? account.id}`]
            if (wasDefault) {
                lines.push(
                    chalk.dim(
                        'Cleared default account. Set a new one with `td accounts use <id|email>`.',
                    ),
                )
            }
            return lines
        },
        onRemoved: () => {
            const result = store.getLastClearResult()
            if (result?.warning) {
                console.error(chalk.yellow('Warning:'), result.warning)
            }
        },
    })
}

import { attachAccountListCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'
import { isAccessible } from '../../lib/global-args.js'
import { projectAccount } from './project-account.js'

/**
 * Attach `td accounts list` via cli-core's generic `attachAccountListCommand`,
 * which reads `store.list()` and owns the `{ accounts, default }` machine
 * envelope. The Todoist overrides keep human output identical to the
 * hand-rolled version (`<email> (id:<id>)` + a default marker that respects
 * `--accessible`) and flatten each machine entry via `projectAccount`.
 *
 * `isDefault` now reflects the store's *effective* default (a lone account
 * counts as default even with no pinned `defaultUser`), matching what
 * `active()` would resolve.
 */
export function attachTodoistUserListCommand(parent: Command, store: TodoistTokenStore): Command {
    return attachAccountListCommand<TodoistAccount>(parent, {
        store,
        description: 'List all stored Todoist accounts',
        renderText: ({ accounts }) => {
            if (accounts.length === 0) {
                return chalk.dim('No stored Todoist accounts. Run `td auth login` to add one.')
            }
            const accessible = isAccessible()
            return accounts.map(({ account, isDefault }) => {
                const marker = isDefault
                    ? accessible
                        ? ' [default]'
                        : chalk.green(' (default)')
                    : ''
                return `${account.email} ${chalk.dim(`(id:${account.id})`)}${marker}`
            })
        },
        renderJson: ({ account, isDefault }) => projectAccount(account, isDefault),
    })
}

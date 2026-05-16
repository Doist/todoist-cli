import chalk from 'chalk'
import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { readConfig } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { getDefaultUserId, requireUserByRef } from '../../lib/users.js'

export async function removeUserCommand(ref: string | undefined): Promise<void> {
    if (!ref) {
        throw new CliError(
            'MISSING_REF',
            'Please provide a user id or email: `td user remove <id|email>`',
        )
    }

    // Resolve the ref against the on-disk config first so we can report
    // "Removed <email>" + the "cleared default" hint with the user's actual
    // email — the store's clear path is keyed by id, not email, and would
    // silently no-op on miss (printing the wrong reassurance).
    const config = await readConfig()
    const { user } = requireUserByRef(config, ref)
    const wasDefault = getDefaultUserId(config) === user.id

    const store = createTodoistTokenStore()
    await store.clear(user.id)

    if (!isQuiet()) {
        console.log(chalk.green('✓'), `Removed ${user.email}`)
        if (wasDefault) {
            console.log(
                chalk.dim('Cleared default account. Set a new one with `td user use <id|email>`.'),
            )
        }
    }

    const result = store.getLastClearResult()
    if (result?.warning) {
        console.error(chalk.yellow('Warning:'), result.warning)
    }
}

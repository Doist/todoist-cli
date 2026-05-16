import chalk from 'chalk'
import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'

export async function useUserCommand(ref: string | undefined): Promise<void> {
    if (!ref) {
        throw new CliError(
            'MISSING_REF',
            'Please provide a user id or email: `td user use <id|email>`',
        )
    }

    // `store.setDefault(ref)` throws `CliError('ACCOUNT_NOT_FOUND', …)` on miss,
    // which the top-level error handler renders as the standard "not found"
    // message — no pre-check needed.
    await createTodoistTokenStore().setDefault(ref)

    if (!isQuiet()) {
        console.log(chalk.green('✓'), `Default account set to ${ref}`)
    }
}

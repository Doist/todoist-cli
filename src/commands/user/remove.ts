import chalk from 'chalk'
import { readConfig, removeUserById } from '../../lib/auth.js'
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

    const config = await readConfig()
    const { user } = requireUserByRef(config, ref)
    const wasDefault = getDefaultUserId(config) === user.id

    const result = await removeUserById(user.id)

    if (!isQuiet()) {
        console.log(chalk.green('✓'), `Removed ${user.email}`)
        if (wasDefault) {
            console.log(
                chalk.dim('Cleared default account. Set a new one with `td user use <id|email>`.'),
            )
        }
        if (result.warning) {
            console.error(chalk.yellow('Warning:'), result.warning)
        }
    }
}

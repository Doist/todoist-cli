import chalk from 'chalk'
import { readConfig, setDefaultUserId } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { requireUserByRef } from '../../lib/users.js'

export async function useUserCommand(ref: string | undefined): Promise<void> {
    if (!ref) {
        throw new CliError(
            'MISSING_REF',
            'Please provide a user id or email: `td user use <id|email>`',
        )
    }

    const config = await readConfig()
    const { user } = requireUserByRef(config, ref)
    await setDefaultUserId(user.id)

    if (!isQuiet()) {
        console.log(chalk.green('✓'), `Default account set to ${user.email} (id:${user.id})`)
    }
}

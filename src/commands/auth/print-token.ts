import { resolveActiveUser, TOKEN_ENV_VAR } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'

export async function printToken(): Promise<void> {
    if (process.env[TOKEN_ENV_VAR]) {
        throw new CliError(
            'TOKEN_FROM_ENV',
            `Refusing to print token: ${TOKEN_ENV_VAR} is set in the environment.`,
            [
                `The token is already available in your environment as $${TOKEN_ENV_VAR}.`,
                `Unset ${TOKEN_ENV_VAR} to print the stored token instead.`,
            ],
        )
    }

    const resolved = await resolveActiveUser()
    console.log(resolved.token)
}

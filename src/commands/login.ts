import { Command } from 'commander'
import { saveApiToken } from '../lib/auth.js'
import chalk from 'chalk'

async function loginWithToken(token: string): Promise<void> {
  try {
    // Save token to config
    await saveApiToken(token.trim())

    console.log(chalk.green('✓'), 'API token saved successfully!')
    console.log(chalk.dim('Token saved to ~/.config/todoist-cli/config.json'))
  } catch (error: any) {
    throw error
  }
}

export function registerLoginCommand(program: Command): void {
  const login = program
    .command('login')
    .description('Authenticate with Todoist')

  login
    .command('token <token>')
    .description('Save API token to config file')
    .action(loginWithToken)
}

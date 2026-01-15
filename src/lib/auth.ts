import { readFile, writeFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join, dirname } from 'path'

const CONFIG_PATH = join(homedir(), '.config', 'todoist-cli', 'config.json')

interface Config {
  api_token?: string
}

export async function getApiToken(): Promise<string> {
  // Priority 1: Environment variable
  const envToken = process.env.TODOIST_API_TOKEN
  if (envToken) {
    return envToken
  }

  // Priority 2: Config file
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8')
    const config: Config = JSON.parse(content)
    if (config.api_token) {
      return config.api_token
    }
  } catch {
    // Config file doesn't exist or is invalid
  }

  throw new Error(
    'No API token found. Set TODOIST_API_TOKEN environment variable or create ~/.config/todoist-cli/config.json with {"api_token": "your-token"}'
  )
}

export async function saveApiToken(token: string): Promise<void> {
  // Validate token (non-empty, reasonable length)
  if (!token || token.trim().length < 10) {
    throw new Error('Invalid token: Token must be at least 10 characters')
  }

  // Ensure config directory exists
  const configDir = dirname(CONFIG_PATH)
  await mkdir(configDir, { recursive: true })

  // Read existing config to preserve other settings
  let existingConfig: Config = {}
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8')
    existingConfig = JSON.parse(content)
  } catch {
    // Config doesn't exist - start fresh
  }

  // Update config with new token
  const newConfig: Config = {
    ...existingConfig,
    api_token: token.trim(),
  }

  // Write config file with proper formatting
  await writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 2) + '\n')
}

import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

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

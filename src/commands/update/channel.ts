import chalk from 'chalk'
import { readConfig } from '../../lib/config.js'

export async function showChannel(): Promise<void> {
    const config = await readConfig()
    const channel = config.update_channel ?? 'stable'

    if (channel === 'pre-release') {
        console.log(`Update channel: ${chalk.magenta('pre-release')}`)
    } else {
        console.log(`Update channel: ${chalk.green('stable')}`)
    }
}

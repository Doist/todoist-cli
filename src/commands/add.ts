import { Command } from 'commander'
import { failWithUsage } from '../lib/missing-argument.js'
import { quickaddTask, type QuickaddOptions } from './task/quickadd.js'

export function registerAddCommand(program: Command): void {
    const addCmd = program
        .command('add [text]')
        .description(
            'Quick add with natural language (human shorthand for "td task quickadd" / "td task qa")',
        )
        .option('--stdin', 'Read text from stdin')
        .option('--json', 'Output the created task as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((text: string | undefined, options: QuickaddOptions) => {
            if (!text && !options.stdin) {
                failWithUsage(addCmd)
                return
            }
            return quickaddTask({ ...options, text })
        })
}

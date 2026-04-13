import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatDue, formatJson, printDryRun } from '../../lib/output.js'
import { readStdin } from '../../lib/stdin.js'

export interface QuickaddOptions {
    text?: string
    stdin?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function quickaddTask(options: QuickaddOptions): Promise<void> {
    if (options.text && options.stdin) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot specify text both as argument and --stdin',
        )
    }

    const text = options.stdin ? (await readStdin()).trim() : options.text

    if (!text) {
        throw new CliError('MISSING_CONTENT', 'No text provided for quick add')
    }

    if (options.dryRun) {
        printDryRun('quick add task', {
            Text: text,
        })
        return
    }

    const api = await getApi()
    const task = await api.quickAddTask({ text })

    if (options.json) {
        console.log(formatJson(task, 'task'))
        return
    }

    if (isQuiet()) {
        console.log(task.id)
        return
    }

    console.log(`Created: ${task.content}`)
    if (task.due) console.log(`Due: ${formatDue(task.due)}`)
    console.log(chalk.dim(`ID: ${task.id}`))
}

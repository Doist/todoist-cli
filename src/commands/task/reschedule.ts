import { getApi, rescheduleTask as rescheduleTaskSync } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatDue, formatJson, printDryRun } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'

export async function rescheduleTask(
    ref: string,
    date: string,
    options: { json?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (!task.due) {
        throw new CliError(
            'NO_DUE_DATE',
            `Task "${task.content}" has no due date. Use "td task update --due" to set one.`,
        )
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/
    if (!dateRegex.test(date)) {
        throw new CliError('INVALID_DATE', `Invalid date format: "${date}"`, [
            'Use YYYY-MM-DD for date-only, or YYYY-MM-DDTHH:MM:SS for datetime.',
            'Examples: 2026-03-20, 2026-03-20T14:00:00',
        ])
    }

    if (options.dryRun) {
        printDryRun('reschedule task', {
            Task: task.content,
            Date: date,
        })
        return
    }

    await rescheduleTaskSync(task.id, date, task.due)

    const updated = await api.getTask(task.id)

    if (options.json) {
        console.log(formatJson(updated, 'task'))
        return
    }

    if (!isQuiet()) {
        console.log(`Rescheduled: ${updated.content} (id:${task.id})`)
        const due = formatDue(updated.due)
        if (due) {
            console.log(`Due: ${due}`)
        }
    }
}

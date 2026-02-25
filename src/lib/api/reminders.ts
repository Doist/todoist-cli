import { createCommand, type Reminder as SdkReminder } from '@doist/todoist-api-typescript'
import { getApi, pickDefined } from './core.js'

export interface ReminderDue {
    date: string
    timezone?: string
    isRecurring?: boolean
    string?: string
    lang?: string
}

export interface Reminder {
    id: string
    itemId: string
    type: 'absolute' | 'relative' | 'location'
    due?: ReminderDue
    minuteOffset?: number
    isDeleted: boolean
}

function toReminder(r: SdkReminder): Reminder {
    return {
        id: r.id,
        itemId: r.itemId,
        type: r.type,
        due: 'due' in r && r.due ? (r.due as ReminderDue) : undefined,
        minuteOffset:
            'minuteOffset' in r ? (r as { minuteOffset: number }).minuteOffset : undefined,
        isDeleted: r.isDeleted,
    }
}

export async function fetchReminders(): Promise<Reminder[]> {
    const api = await getApi()
    const response = await api.sync({
        resourceTypes: ['reminders'],
        syncToken: '*',
    })
    return (response.reminders ?? []).map(toReminder).filter((r) => !r.isDeleted)
}

export async function getTaskReminders(taskId: string): Promise<Reminder[]> {
    const reminders = await fetchReminders()
    return reminders.filter((r) => r.itemId === taskId)
}

export interface AddReminderArgs {
    itemId: string
    minuteOffset?: number
    due?: ReminderDue
}

export async function addReminder(args: AddReminderArgs): Promise<string> {
    const api = await getApi()
    const tempId = crypto.randomUUID()

    const type = args.minuteOffset !== undefined ? ('relative' as const) : ('absolute' as const)
    const response = await api.sync({
        commands: [
            createCommand(
                'reminder_add',
                {
                    type,
                    itemId: args.itemId,
                    ...pickDefined({
                        minuteOffset: args.minuteOffset,
                        due: args.due,
                    }),
                },
                tempId,
            ),
        ],
    })
    return response.tempIdMapping?.[tempId] ?? tempId
}

export interface UpdateReminderArgs {
    minuteOffset?: number
    due?: ReminderDue
}

export async function updateReminder(id: string, args: UpdateReminderArgs): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [
            createCommand('reminder_update', {
                id,
                ...pickDefined({
                    minuteOffset: args.minuteOffset,
                    due: args.due,
                }),
            }),
        ],
    })
}

export async function deleteReminder(id: string): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('reminder_delete', { id })],
    })
}

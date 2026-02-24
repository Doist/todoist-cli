import { getApiToken } from '../auth.js'
import { markResourcesDirty } from '../sync/engine.js'
import { executeSyncCommand, generateUuid, type SyncCommand, type SyncResponse } from './core.js'

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
    type: 'absolute'
    due?: ReminderDue
    minuteOffset?: number
    isDeleted: boolean
}

function parseReminder(r: Record<string, unknown>): Reminder {
    return {
        id: String(r.id),
        itemId: String(r.item_id),
        type: 'absolute',
        due: r.due as ReminderDue | undefined,
        minuteOffset: r.minute_offset as number | undefined,
        isDeleted: Boolean(r.is_deleted),
    }
}

export async function fetchReminders(): Promise<Reminder[]> {
    const token = await getApiToken()
    const response = await fetch('https://api.todoist.com/api/v1/sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: '*',
            resource_types: '["reminders"]',
        }),
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch reminders: ${response.status}`)
    }

    const data: SyncResponse = await response.json()
    if (data.error) {
        throw new Error(`Reminders API error: ${data.error}`)
    }

    return (data.reminders ?? []).map(parseReminder).filter((r) => !r.isDeleted)
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
    const tempId = generateUuid()
    const command: SyncCommand = {
        type: 'reminder_add',
        uuid: generateUuid(),
        temp_id: tempId,
        args: {
            item_id: args.itemId,
            type: 'absolute',
            ...(args.minuteOffset !== undefined && {
                minute_offset: args.minuteOffset,
            }),
            ...(args.due && { due: args.due }),
        },
    }

    const result = await executeSyncCommand([command])
    await markResourcesDirty(['items'])
    return result.temp_id_mapping?.[tempId] ?? tempId
}

export interface UpdateReminderArgs {
    minuteOffset?: number
    due?: ReminderDue
}

export async function updateReminder(id: string, args: UpdateReminderArgs): Promise<void> {
    const command: SyncCommand = {
        type: 'reminder_update',
        uuid: generateUuid(),
        args: {
            id,
            ...(args.minuteOffset !== undefined && {
                minute_offset: args.minuteOffset,
            }),
            ...(args.due && { due: args.due }),
        },
    }

    await executeSyncCommand([command])
    await markResourcesDirty(['items'])
}

export async function deleteReminder(id: string): Promise<void> {
    const command: SyncCommand = {
        type: 'reminder_delete',
        uuid: generateUuid(),
        args: { id },
    }

    await executeSyncCommand([command])
    await markResourcesDirty(['items'])
}

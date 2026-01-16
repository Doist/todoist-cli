import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/notifications.js', () => ({
    fetchNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markNotificationUnread: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    acceptInvitation: vi.fn(),
    rejectInvitation: vi.fn(),
}))

import { registerNotificationCommand } from '../commands/notification.js'
import {
    acceptInvitation,
    fetchNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    markNotificationUnread,
    rejectInvitation,
} from '../lib/api/notifications.js'

const mockFetchNotifications = vi.mocked(fetchNotifications)
const mockMarkRead = vi.mocked(markNotificationRead)
const mockMarkUnread = vi.mocked(markNotificationUnread)
const mockMarkAllRead = vi.mocked(markAllNotificationsRead)
const mockAccept = vi.mocked(acceptInvitation)
const mockReject = vi.mocked(rejectInvitation)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerNotificationCommand(program)
    return program
}

function createShareInvite(overrides = {}) {
    return {
        id: 'notif-1',
        type: 'share_invitation_sent' as const,
        isUnread: true,
        isDeleted: false,
        createdAt: '2025-01-15T10:00:00Z',
        fromUser: { id: 'user-1', name: 'Jane', email: 'jane@example.com' },
        project: { id: 'proj-1', name: 'Project X' },
        invitationId: 'inv-123',
        invitationSecret: 'secret-abc',
        ...overrides,
    }
}

function createItemAssigned(overrides = {}) {
    return {
        id: 'notif-2',
        type: 'item_assigned' as const,
        isUnread: true,
        isDeleted: false,
        createdAt: '2025-01-14T08:00:00Z',
        task: { id: 'task-1', content: 'Review PR #42' },
        project: { id: 'proj-2', name: 'Work' },
        ...overrides,
    }
}

describe('notification list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('lists notifications', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite(), createItemAssigned()])

        await program.parseAsync(['node', 'td', 'notification', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('share_invitation_sent'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('item_assigned'))
        consoleSpy.mockRestore()
    })

    it('shows "No notifications." when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([])

        await program.parseAsync(['node', 'td', 'notification', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No notifications.')
        consoleSpy.mockRestore()
    })

    it('filters unread with --unread', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ isUnread: true }),
            createItemAssigned({ id: 'notif-3', isUnread: false }),
        ])

        await program.parseAsync(['node', 'td', 'notification', 'list', '--unread'])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('share_invitation_sent'))
        consoleSpy.mockRestore()
    })

    it('filters read with --read', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ isUnread: true }),
            createItemAssigned({ id: 'notif-3', isUnread: false }),
        ])

        await program.parseAsync(['node', 'td', 'notification', 'list', '--read'])

        const output = consoleSpy.mock.calls[0][0]
        expect(output).toContain('item_assigned')
        expect(output).not.toContain('share_invitation_sent')
        consoleSpy.mockRestore()
    })

    it('filters by type with --type', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ id: 'n1' }),
            createItemAssigned({ id: 'n2' }),
            createShareInvite({ id: 'n3' }),
        ])

        await program.parseAsync(['node', 'td', 'notification', 'list', '--type', 'item_assigned'])

        const output = consoleSpy.mock.calls[0][0]
        expect(output).toContain('id:n2')
        expect(output).not.toContain('id:n1')
        expect(output).not.toContain('id:n3')
        consoleSpy.mockRestore()
    })

    it('filters by multiple types with --type', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ id: 'n1' }),
            createItemAssigned({ id: 'n2' }),
            { ...createShareInvite({ id: 'n3' }), type: 'note_added' as const },
        ])

        await program.parseAsync([
            'node',
            'td',
            'notification',
            'list',
            '--type',
            'item_assigned,note_added',
        ])

        const output = consoleSpy.mock.calls[0][0]
        expect(output).toContain('id:n2')
        expect(output).toContain('id:n3')
        expect(output).not.toContain('id:n1')
        consoleSpy.mockRestore()
    })

    it('throws when both --read and --unread specified', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'notification', 'list', '--read', '--unread']),
        ).rejects.toThrow('INVALID_OPTIONS')
    })

    it('respects --offset', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ id: 'n1' }),
            createShareInvite({ id: 'n2' }),
            createShareInvite({ id: 'n3' }),
        ])

        await program.parseAsync([
            'node',
            'td',
            'notification',
            'list',
            '--offset',
            '1',
            '--limit',
            '1',
        ])

        const output = consoleSpy.mock.calls[0][0]
        expect(output).toContain('id:n2')
        expect(output).not.toContain('id:n1')
        expect(output).not.toContain('id:n3')
        consoleSpy.mockRestore()
    })

    it('respects --limit', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ id: 'n1' }),
            createShareInvite({ id: 'n2' }),
            createShareInvite({ id: 'n3' }),
        ])

        await program.parseAsync(['node', 'td', 'notification', 'list', '--limit', '2'])

        const output = consoleSpy.mock.calls[0][0]
        expect(output).toContain('id:n1')
        expect(output).toContain('id:n2')
        expect(output).not.toContain('id:n3')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])

        await program.parseAsync(['node', 'td', 'notification', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].type).toBe('share_invitation_sent')
        expect(parsed.results[0].invitationSecret).toBeUndefined()
        consoleSpy.mockRestore()
    })

    it('outputs NDJSON with --ndjson', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ id: 'n1' }),
            createShareInvite({ id: 'n2' }),
        ])

        await program.parseAsync(['node', 'td', 'notification', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
        consoleSpy.mockRestore()
    })

    it('does not expose invitationSecret in JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])

        await program.parseAsync(['node', 'td', 'notification', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        expect(output).not.toContain('invitationSecret')
        expect(output).not.toContain('secret-abc')
        consoleSpy.mockRestore()
    })
})

describe('notification view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows notification details', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])

        await program.parseAsync(['node', 'td', 'notification', 'view', 'id:notif-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('share_invitation_sent'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Jane'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Project X'))
        consoleSpy.mockRestore()
    })

    it('shows actions for share invitation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])

        await program.parseAsync(['node', 'td', 'notification', 'view', 'id:notif-1'])

        expect(consoleSpy).toHaveBeenCalledWith('Actions:')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('td notification accept'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('td notification reject'))
        consoleSpy.mockRestore()
    })

    it('does not show actions for non-invitation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createItemAssigned()])

        await program.parseAsync(['node', 'td', 'notification', 'view', 'id:notif-2'])

        const calls = consoleSpy.mock.calls.map((c) => c[0])
        expect(calls).not.toContainEqual('Actions:')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])

        await program.parseAsync(['node', 'td', 'notification', 'view', 'id:notif-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.type).toBe('share_invitation_sent')
        expect(parsed.invitationSecret).toBeUndefined()
        consoleSpy.mockRestore()
    })

    it('throws for non-existent notification', async () => {
        const program = createProgram()

        mockFetchNotifications.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'notification', 'view', 'id:nonexistent']),
        ).rejects.toThrow('NOTIFICATION_NOT_FOUND')
    })
})

describe('notification accept', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('accepts share invitation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])
        mockAccept.mockResolvedValue(undefined)
        mockMarkRead.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'notification', 'accept', 'id:notif-1'])

        expect(mockAccept).toHaveBeenCalledWith('inv-123', 'secret-abc')
        expect(mockMarkRead).toHaveBeenCalledWith('notif-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Accepted invitation'))
        consoleSpy.mockRestore()
    })

    it('throws for non-invitation type', async () => {
        const program = createProgram()

        mockFetchNotifications.mockResolvedValue([createItemAssigned()])

        await expect(
            program.parseAsync(['node', 'td', 'notification', 'accept', 'id:notif-2']),
        ).rejects.toThrow('item_assigned')
    })

    it('throws for non-existent notification', async () => {
        const program = createProgram()

        mockFetchNotifications.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'notification', 'accept', 'id:nonexistent']),
        ).rejects.toThrow('NOTIFICATION_NOT_FOUND')
    })
})

describe('notification reject', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects share invitation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])
        mockReject.mockResolvedValue(undefined)
        mockMarkRead.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'notification', 'reject', 'id:notif-1'])

        expect(mockReject).toHaveBeenCalledWith('inv-123', 'secret-abc')
        expect(mockMarkRead).toHaveBeenCalledWith('notif-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Rejected invitation'))
        consoleSpy.mockRestore()
    })

    it('throws for non-invitation type', async () => {
        const program = createProgram()

        mockFetchNotifications.mockResolvedValue([createItemAssigned()])

        await expect(
            program.parseAsync(['node', 'td', 'notification', 'reject', 'id:notif-2']),
        ).rejects.toThrow('item_assigned')
    })
})

describe('notification read', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('marks single notification as read', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite()])
        mockMarkRead.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'notification', 'read', 'id:notif-1'])

        expect(mockMarkRead).toHaveBeenCalledWith('notif-1')
        expect(consoleSpy).toHaveBeenCalledWith('Marked as read.')
        consoleSpy.mockRestore()
    })

    it('warns without --yes for --all', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'notification', 'read', '--all'])

        expect(mockMarkAllRead).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(
            'Use --all --yes to mark all notifications as read.',
        )
        consoleSpy.mockRestore()
    })

    it('marks all as read with --all --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([
            createShareInvite({ isUnread: true }),
            createItemAssigned({ isUnread: true }),
        ])
        mockMarkAllRead.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'notification', 'read', '--all', '--yes'])

        expect(mockMarkAllRead).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Marked 2 notifications as read.')
        consoleSpy.mockRestore()
    })

    it('throws when no id and no --all', async () => {
        const program = createProgram()

        await expect(program.parseAsync(['node', 'td', 'notification', 'read'])).rejects.toThrow(
            'MISSING_ID',
        )
    })
})

describe('notification unread', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('marks notification as unread', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchNotifications.mockResolvedValue([createShareInvite({ isUnread: false })])
        mockMarkUnread.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'notification', 'unread', 'id:notif-1'])

        expect(mockMarkUnread).toHaveBeenCalledWith('notif-1')
        expect(consoleSpy).toHaveBeenCalledWith('Marked as unread.')
        consoleSpy.mockRestore()
    })

    it('throws for non-existent notification', async () => {
        const program = createProgram()

        mockFetchNotifications.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'notification', 'unread', 'id:nonexistent']),
        ).rejects.toThrow('NOTIFICATION_NOT_FOUND')
    })
})

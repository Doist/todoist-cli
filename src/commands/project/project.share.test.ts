import { captureConsole } from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { setupApiMock } from '../../test-support/api-mock.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { createProjectProgram as createProgram } from '../../test-support/project-program.js'

describe('project share', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        consoleSpy = captureConsole()
    })

    function shareCommand(args: { type: string; args: Record<string, unknown> }) {
        return expect.objectContaining({
            commands: [expect.objectContaining(args)],
        })
    }

    it('shares a personal project without a workspace role', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Field Notes',
            isShared: true,
        })

        await program.parseAsync(['node', 'td', 'project', 'share', 'id:proj-1', 'alan@ingen.com'])

        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
        expect(mockApi.sync).toHaveBeenCalledWith(
            shareCommand({
                type: 'share_project',
                args: { projectId: 'proj-1', email: 'alan@ingen.com', message: undefined },
            }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Shared: Field Notes with alan@ingen.com')
    })

    it('passes an optional message when sharing a personal project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Field Notes', isShared: true })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'share',
            'id:proj-1',
            'ellie@ingen.com',
            '--message',
            'Welcome aboard',
        ])

        expect(mockApi.sync).toHaveBeenCalledWith(
            shareCommand({
                type: 'share_project',
                args: { projectId: 'proj-1', email: 'ellie@ingen.com', message: 'Welcome aboard' },
            }),
        )
    })

    it('warns and ignores --role / --auto-invite on a personal project', async () => {
        const program = createProgram()
        const errorSpy = captureConsole('error')

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Field Notes', isShared: true })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'share',
            'id:proj-1',
            'alan@ingen.com',
            '--role',
            'admin',
            '--auto-invite',
        ])

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ignored for personal'))
        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
        expect(mockApi.sync).toHaveBeenCalledWith(
            shareCommand({
                type: 'share_project',
                args: { projectId: 'proj-1', email: 'alan@ingen.com', message: undefined },
            }),
        )
    })

    it('shares a workspace project with an existing member using the default MEMBER role', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    fullName: 'Alan Grant',
                    userEmail: 'alan@ingen.com',
                    role: 'MEMBER',
                },
            ],
            hasMore: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'share', 'id:proj-1', 'alan@ingen.com'])

        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
        expect(mockApi.sync).toHaveBeenCalledWith(
            shareCommand({
                type: 'share_project',
                args: {
                    projectId: 'proj-1',
                    email: 'alan@ingen.com',
                    message: undefined,
                    workspaceRole: 'MEMBER',
                },
            }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Shared: Park Ops with alan@ingen.com')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Role: MEMBER'))
    })

    it('errors when a workspace email is not a member and --auto-invite is absent', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({ workspaceUsers: [], hasMore: false })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'share', 'id:proj-1', 'ellie@ingen.com']),
        ).rejects.toMatchObject({ code: 'NOT_WORKSPACE_MEMBER' })

        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
        expect(mockApi.sync).not.toHaveBeenCalled()
    })

    it('invites a non-member to the workspace first when --auto-invite is set', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({ workspaceUsers: [], hasMore: false })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'share',
            'id:proj-1',
            'ellie@ingen.com',
            '--role',
            'guest',
            '--auto-invite',
        ])

        expect(mockApi.inviteWorkspaceUsers).toHaveBeenCalledWith({
            workspaceId: 'ws-1',
            emailList: ['ellie@ingen.com'],
            role: 'GUEST',
        })
        expect(mockApi.sync).toHaveBeenCalledWith(
            shareCommand({
                type: 'share_project',
                args: {
                    projectId: 'proj-1',
                    email: 'ellie@ingen.com',
                    message: undefined,
                    workspaceRole: 'GUEST',
                },
            }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Invited ellie@ingen.com to workspace')
    })

    it('rejects an invalid --role (Commander choices)', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'share',
                'id:proj-1',
                'alan@ingen.com',
                '--role',
                'editor',
            ]),
        ).rejects.toThrow('Allowed choices are')

        expect(mockApi.sync).not.toHaveBeenCalled()
        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
    })

    it('--role is case-insensitive', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({ workspaceUsers: [], hasMore: false })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'share',
            'id:proj-1',
            'ellie@ingen.com',
            '--role',
            'Guest',
            '--auto-invite',
        ])

        expect(mockApi.inviteWorkspaceUsers).toHaveBeenCalledWith(
            expect.objectContaining({ role: 'GUEST' }),
        )
    })

    it('--dry-run previews without mutating', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({ workspaceUsers: [], hasMore: false })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'share',
            'id:proj-1',
            'ellie@ingen.com',
            '--auto-invite',
            '--dry-run',
        ])

        expect(mockApi.sync).not.toHaveBeenCalled()
        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would share project'))
    })

    it('--dry-run on a workspace project errors when the email is not a member and --auto-invite is omitted', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({ workspaceUsers: [], hasMore: false })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'share',
                'id:proj-1',
                'ellie@ingen.com',
                '--dry-run',
            ]),
        ).rejects.toMatchObject({ code: 'NOT_WORKSPACE_MEMBER' })

        expect(mockApi.sync).not.toHaveBeenCalled()
        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    fullName: 'Alan Grant',
                    userEmail: 'alan@ingen.com',
                    role: 'MEMBER',
                },
            ],
            hasMore: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'share',
            'id:proj-1',
            'alan@ingen.com',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed).toEqual({
            projectId: 'proj-1',
            projectName: 'Park Ops',
            email: 'alan@ingen.com',
            role: 'MEMBER',
            autoInvited: false,
        })
    })

    it('finds a member across paginated workspace-user pages', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Park Ops',
            workspaceId: 'ws-1',
        })
        mockApi.getWorkspaceUsers
            .mockResolvedValueOnce({
                workspaceUsers: [
                    {
                        userId: 'user-1',
                        fullName: 'John Hammond',
                        userEmail: 'john@ingen.com',
                        role: 'ADMIN',
                    },
                ],
                hasMore: true,
                nextCursor: 'page-2',
            })
            .mockResolvedValueOnce({
                workspaceUsers: [
                    {
                        userId: 'user-2',
                        fullName: 'Alan Grant',
                        userEmail: 'alan@ingen.com',
                        role: 'MEMBER',
                    },
                ],
                hasMore: false,
            })

        await program.parseAsync(['node', 'td', 'project', 'share', 'id:proj-1', 'alan@ingen.com'])

        expect(mockApi.getWorkspaceUsers).toHaveBeenCalledTimes(2)
        expect(mockApi.getWorkspaceUsers).toHaveBeenNthCalledWith(2, {
            workspaceId: 'ws-1',
            cursor: 'page-2',
            limit: 200,
        })
        expect(mockApi.inviteWorkspaceUsers).not.toHaveBeenCalled()
        expect(mockApi.sync).toHaveBeenCalledWith(
            shareCommand({
                type: 'share_project',
                args: {
                    projectId: 'proj-1',
                    email: 'alan@ingen.com',
                    message: undefined,
                    workspaceRole: 'MEMBER',
                },
            }),
        )
    })

    it('accepts the project via the --project flag', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Field Notes', isShared: true })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'share',
            '--project',
            'id:proj-1',
            'alan@ingen.com',
        ])

        expect(mockApi.sync).toHaveBeenCalledWith(
            shareCommand({
                type: 'share_project',
                args: { projectId: 'proj-1', email: 'alan@ingen.com', message: undefined },
            }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Shared: Field Notes with alan@ingen.com')
    })

    it('errors when the project is given both positionally and via --project', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'share',
                'id:proj-1',
                'alan@ingen.com',
                '--project',
                'id:proj-2',
            ]),
        ).rejects.toMatchObject({ code: 'CONFLICTING_OPTIONS' })

        expect(mockApi.sync).not.toHaveBeenCalled()
    })
})

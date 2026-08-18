import type { Comment, TodoistApi } from '@doist/todoist-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultCommentRecipients } from './comment-recipients.js'

const CURRENT_USER_ID = 'user-me'

function comment(overrides: Partial<Comment> = {}): Comment {
    return {
        id: 'comment-1',
        content: 'Existing',
        postedAt: new Date('2024-01-01T12:00:00Z'),
        postedUid: 'user-bo',
        taskId: 'task-1',
        projectId: undefined,
        fileAttachment: null,
        uidsToNotify: null,
        reactions: null,
        isDeleted: false,
        ...overrides,
    }
}

describe('getDefaultCommentRecipients', () => {
    let api: TodoistApi

    beforeEach(() => {
        api = {
            getComments: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
            getTask: vi.fn().mockResolvedValue({
                id: 'task-1',
                responsibleUid: null,
                assignedByUid: null,
                addedByUid: null,
            }),
        } as unknown as TodoistApi
    })

    describe('a thread that already has comments', () => {
        it("takes the newest comment's participants, not the first page's", async () => {
            vi.mocked(api.getComments).mockResolvedValue({
                results: [
                    comment({
                        postedAt: new Date('2024-03-01T09:00:00Z'),
                        postedUid: 'recent-author',
                        uidsToNotify: ['recent-participant'],
                    }),
                    comment({
                        postedAt: new Date('2024-01-01T09:00:00Z'),
                        postedUid: 'stale-author',
                        uidsToNotify: ['stale-participant'],
                    }),
                ],
                nextCursor: null,
            })

            const recipients = await getDefaultCommentRecipients(
                api,
                { taskId: 'task-1' },
                CURRENT_USER_ID,
            )

            expect(recipients).toEqual(['recent-participant', 'recent-author'])
            expect(api.getTask).not.toHaveBeenCalled()
        })

        it('keeps the chain alive from a comment that notified nobody', async () => {
            vi.mocked(api.getComments).mockResolvedValue({
                results: [comment({ postedUid: 'agent', uidsToNotify: null })],
                nextCursor: null,
            })

            await expect(
                getDefaultCommentRecipients(api, { taskId: 'task-1' }, CURRENT_USER_ID),
            ).resolves.toEqual(['agent'])
        })

        it('excludes the author of the comment being posted', async () => {
            vi.mocked(api.getComments).mockResolvedValue({
                results: [
                    comment({
                        postedUid: CURRENT_USER_ID,
                        uidsToNotify: [CURRENT_USER_ID, 'other'],
                    }),
                ],
                nextCursor: null,
            })

            await expect(
                getDefaultCommentRecipients(api, { taskId: 'task-1' }, CURRENT_USER_ID),
            ).resolves.toEqual(['other'])
        })

        it('walks every page to reach the newest comment', async () => {
            vi.mocked(api.getComments)
                .mockResolvedValueOnce({
                    results: [comment({ postedAt: new Date('2024-01-01'), postedUid: 'p1' })],
                    nextCursor: 'page-2',
                })
                .mockResolvedValueOnce({
                    results: [comment({ postedAt: new Date('2024-02-01'), postedUid: 'p2' })],
                    nextCursor: 'page-3',
                })
                .mockResolvedValueOnce({
                    results: [comment({ postedAt: new Date('2024-03-01'), postedUid: 'p3' })],
                    nextCursor: null,
                })

            const recipients = await getDefaultCommentRecipients(
                api,
                { taskId: 'task-1' },
                CURRENT_USER_ID,
            )

            expect(api.getComments).toHaveBeenCalledTimes(3)
            expect(api.getComments).toHaveBeenLastCalledWith(
                expect.objectContaining({ cursor: 'page-3' }),
            )
            expect(recipients).toEqual(['p3'])
        })
    })

    describe('a task with no comments yet', () => {
        it('takes the assignee, assigner and creator', async () => {
            vi.mocked(api.getTask).mockResolvedValue({
                responsibleUid: 'assignee',
                assignedByUid: 'assigner',
                addedByUid: 'creator',
            } as Awaited<ReturnType<TodoistApi['getTask']>>)

            await expect(
                getDefaultCommentRecipients(api, { taskId: 'task-1' }, CURRENT_USER_ID),
            ).resolves.toEqual(['assignee', 'assigner', 'creator'])
        })

        it('drops unset uids and collapses one person filling two roles', async () => {
            vi.mocked(api.getTask).mockResolvedValue({
                responsibleUid: 'ana',
                assignedByUid: null,
                addedByUid: 'ana',
            } as Awaited<ReturnType<TodoistApi['getTask']>>)

            await expect(
                getDefaultCommentRecipients(api, { taskId: 'task-1' }, CURRENT_USER_ID),
            ).resolves.toEqual(['ana'])
        })

        it('notifies nobody when the author is the only party', async () => {
            vi.mocked(api.getTask).mockResolvedValue({
                responsibleUid: CURRENT_USER_ID,
                assignedByUid: null,
                addedByUid: CURRENT_USER_ID,
            } as Awaited<ReturnType<TodoistApi['getTask']>>)

            await expect(
                getDefaultCommentRecipients(api, { taskId: 'task-1' }, CURRENT_USER_ID),
            ).resolves.toEqual([])
        })
    })

    it('notifies nobody on a project with no comments, having no assignee to fall back on', async () => {
        const recipients = await getDefaultCommentRecipients(
            api,
            { projectId: 'proj-1' },
            CURRENT_USER_ID,
        )

        expect(api.getComments).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
        expect(recipients).toEqual([])
        expect(api.getTask).not.toHaveBeenCalled()
    })
})

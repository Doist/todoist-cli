import type { TodoistApi } from '@doist/todoist-api-typescript'
import type { Mock } from 'vitest'
import { vi } from 'vitest'

// biome-ignore lint/suspicious/noExplicitAny: standard conditional type pattern (same as built-in Parameters<T>/ReturnType<T>)
type FunctionKeys<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never }[keyof T]

export type MockApi = {
    [K in FunctionKeys<TodoistApi>]: TodoistApi[K] & Mock
} & TodoistApi

export function createMockApi(overrides: Partial<TodoistApi> = {}): MockApi {
    return {
        // Tasks
        getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getTask: vi.fn(),
        getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        addTask: vi.fn(),
        updateTask: vi.fn(),
        closeTask: vi.fn(),
        reopenTask: vi.fn(),
        deleteTask: vi.fn(),
        moveTask: vi.fn(),
        quickAddTask: vi.fn(),
        // Completed tasks
        getCompletedTasksByCompletionDate: vi
            .fn()
            .mockResolvedValue({ items: [], nextCursor: null }),
        // Projects
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProject: vi.fn(),
        addProject: vi.fn(),
        updateProject: vi.fn(),
        archiveProject: vi.fn(),
        unarchiveProject: vi.fn(),
        deleteProject: vi.fn(),
        moveProjectToWorkspace: vi.fn(),
        moveProjectToPersonal: vi.fn(),
        // Sections
        getSections: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getSection: vi.fn(),
        addSection: vi.fn(),
        deleteSection: vi.fn(),
        updateSection: vi.fn(),
        // Labels
        getLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getLabel: vi.fn(),
        addLabel: vi.fn(),
        deleteLabel: vi.fn(),
        getSharedLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        updateLabel: vi.fn(),
        // Comments
        getComments: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getComment: vi.fn(),
        addComment: vi.fn(),
        deleteComment: vi.fn(),
        updateComment: vi.fn(),
        // Uploads
        uploadFile: vi.fn().mockResolvedValue({
            resourceType: 'file',
            fileName: 'test.pdf',
            fileSize: 1024,
            fileType: 'application/pdf',
            fileUrl: 'https://cdn.todoist.com/files/test.pdf',
            uploadState: 'completed',
        }),
        // User
        getUser: vi.fn(),
        // Activity
        getActivityLogs: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        // Collaborators
        getProjectCollaborators: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        // Workspace
        getWorkspaceUsers: vi.fn().mockResolvedValue({ workspaceUsers: [], hasMore: false }),
        ...overrides,
    } as unknown as MockApi
}

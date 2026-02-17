import type { TodoistApi } from '@doist/todoist-api-typescript'
import { vi } from 'vitest'

export function createMockApi(overrides: Partial<TodoistApi> = {}): TodoistApi {
    return {
        // Tasks
        getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getTask: vi.fn(),
        addTask: vi.fn(),
        updateTask: vi.fn(),
        closeTask: vi.fn(),
        deleteTask: vi.fn(),
        moveTask: vi.fn(),
        quickAddTask: vi.fn(),
        // Projects
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProject: vi.fn(),
        deleteProject: vi.fn(),
        // Sections
        getSections: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getSection: vi.fn(),
        addSection: vi.fn(),
        deleteSection: vi.fn(),
        // Labels
        getLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        addLabel: vi.fn(),
        deleteLabel: vi.fn(),
        getSharedLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        updateLabel: vi.fn(),
        // Comments
        getComments: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getComment: vi.fn(),
        addComment: vi.fn(),
        deleteComment: vi.fn(),
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
        ...overrides,
    } as unknown as TodoistApi
}

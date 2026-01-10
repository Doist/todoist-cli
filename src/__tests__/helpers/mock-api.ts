import { vi } from 'vitest'
import type { TodoistApi } from '@doist/todoist-api-typescript'

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
    // Sections
    getSections: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    getSection: vi.fn(),
    addSection: vi.fn(),
    deleteSection: vi.fn(),
    // Labels
    getLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    addLabel: vi.fn(),
    deleteLabel: vi.fn(),
    // Comments
    getComments: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    getComment: vi.fn(),
    addComment: vi.fn(),
    deleteComment: vi.fn(),
    // User
    getUser: vi.fn(),
    // Activity
    getActivityLogs: vi
      .fn()
      .mockResolvedValue({ results: [], nextCursor: null }),
    ...overrides,
  } as unknown as TodoistApi
}

import type { TodoistApi } from '@doist/todoist-sdk'
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
        searchCompletedTasks: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
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
        searchProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getArchivedProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getArchivedProjectsCount: vi.fn().mockResolvedValue({ count: 0 }),
        getProjectPermissions: vi.fn().mockResolvedValue({
            projectCollaboratorActions: [],
            workspaceCollaboratorActions: [],
        }),
        getFullProject: vi.fn().mockResolvedValue({
            project: null,
            commentsCount: 0,
            tasks: [],
            sections: [],
            collaborators: [],
            notes: [],
        }),
        joinProject: vi.fn(),
        // Sections
        getSections: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getSection: vi.fn(),
        addSection: vi.fn(),
        deleteSection: vi.fn(),
        updateSection: vi.fn(),
        archiveSection: vi.fn(),
        unarchiveSection: vi.fn(),
        searchSections: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        // Labels
        getLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getLabel: vi.fn(),
        addLabel: vi.fn(),
        deleteLabel: vi.fn(),
        getSharedLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        searchLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        renameSharedLabel: vi.fn().mockResolvedValue(true),
        removeSharedLabel: vi.fn().mockResolvedValue(true),
        updateLabel: vi.fn(),
        // Comments
        getComments: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getComment: vi.fn(),
        addComment: vi.fn(),
        deleteComment: vi.fn(),
        updateComment: vi.fn(),
        // Attachments
        viewAttachment: vi.fn(),
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
        getWorkspace: vi.fn(),
        getWorkspaceUsers: vi.fn().mockResolvedValue({ workspaceUsers: [], hasMore: false }),
        getWorkspaceActiveProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getWorkspaceArchivedProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        addWorkspace: vi.fn(),
        updateWorkspace: vi.fn(),
        deleteWorkspace: vi.fn().mockResolvedValue(true),
        getWorkspaceUserTasks: vi.fn().mockResolvedValue({ tasks: [] }),
        getWorkspaceMembersActivity: vi.fn().mockResolvedValue({ members: [] }),
        // Insights
        getProjectActivityStats: vi.fn().mockResolvedValue({ dayItems: [], weekItems: null }),
        getProjectHealth: vi.fn().mockResolvedValue({
            status: 'UNKNOWN',
            isStale: false,
            updateInProgress: false,
        }),
        getProjectHealthContext: vi.fn().mockResolvedValue({
            projectId: '',
            projectName: '',
            projectDescription: null,
            projectMetrics: {
                totalTasks: 0,
                completedTasks: 0,
                overdueTasks: 0,
                tasksCreatedThisWeek: 0,
                tasksCompletedThisWeek: 0,
                averageCompletionTime: null,
            },
            tasks: [],
        }),
        getProjectProgress: vi.fn().mockResolvedValue({
            projectId: '',
            completedCount: 0,
            activeCount: 0,
            progressPercent: 0,
        }),
        getWorkspaceInsights: vi.fn().mockResolvedValue({
            folderId: null,
            projectInsights: [],
        }),
        analyzeProjectHealth: vi.fn().mockResolvedValue({
            status: 'UNKNOWN',
            isStale: false,
            updateInProgress: true,
        }),
        // Templates
        exportTemplateAsFile: vi.fn().mockResolvedValue(''),
        exportTemplateAsUrl: vi.fn().mockResolvedValue({ fileName: '', fileUrl: '' }),
        createProjectFromTemplate: vi.fn().mockResolvedValue({
            status: 'ok',
            projectId: '',
            templateType: 'project',
            projects: [],
            sections: [],
            tasks: [],
            comments: [],
        }),
        importTemplateIntoProject: vi.fn().mockResolvedValue({
            status: 'ok',
            templateType: 'project',
            projects: [],
            sections: [],
            tasks: [],
            comments: [],
        }),
        importTemplateFromId: vi.fn().mockResolvedValue({
            status: 'ok',
            templateType: 'project',
            projects: [],
            sections: [],
            tasks: [],
            comments: [],
        }),
        // Reminders (REST)
        getReminders: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getLocationReminders: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        // Backups
        getBackups: vi.fn().mockResolvedValue([]),
        downloadBackup: vi.fn(),
        ...overrides,
    } as unknown as MockApi
}

import { type Folder as SdkFolder, type SyncWorkspace } from '@doist/todoist-api-typescript'
import { getApi } from './core.js'

export interface Workspace {
    id: string
    name: string
    role: 'ADMIN' | 'MEMBER' | 'GUEST'
    plan: string
    domainName: string | null
    currentMemberCount: number
    currentActiveProjects: number
    memberCountByType: {
        adminCount: number
        memberCount: number
        guestCount: number
    }
}

export interface WorkspaceFolder {
    id: string
    name: string
    workspaceId: string
}

let workspaceCache: Workspace[] | null = null
let folderCache: WorkspaceFolder[] | null = null

function toWorkspace(w: SyncWorkspace): Workspace {
    const raw = w as unknown as Record<string, unknown>
    const memberCounts = raw.member_count_by_type as Record<string, number> | undefined
    return {
        id: String(w.id),
        name: w.name,
        role: w.role,
        plan: w.plan,
        domainName: w.domainName ?? null,
        currentMemberCount: w.currentMemberCount ?? 0,
        currentActiveProjects: w.currentActiveProjects ?? 0,
        memberCountByType: {
            adminCount: memberCounts?.admin_count ?? 0,
            memberCount: memberCounts?.member_count ?? 0,
            guestCount: memberCounts?.guest_count ?? 0,
        },
    }
}

function toFolder(f: SdkFolder): WorkspaceFolder {
    return {
        id: String(f.id),
        name: f.name,
        workspaceId: f.workspaceId,
    }
}

async function fetchWorkspaceData(): Promise<{
    workspaces: Workspace[]
    folders: WorkspaceFolder[]
}> {
    if (workspaceCache !== null && folderCache !== null) {
        return { workspaces: workspaceCache, folders: folderCache }
    }

    const api = await getApi()
    const response = await api.sync({
        resourceTypes: ['workspaces', 'folders'],
        syncToken: '*',
    })

    const workspaces = (response.workspaces ?? []).map(toWorkspace)
    const folders = (response.folders ?? []).map(toFolder)

    workspaceCache = workspaces
    folderCache = folders
    return { workspaces, folders }
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
    const { workspaces } = await fetchWorkspaceData()
    return workspaces
}

export async function fetchWorkspaceFolders(): Promise<WorkspaceFolder[]> {
    try {
        const { folders } = await fetchWorkspaceData()
        return folders
    } catch {
        return []
    }
}

export function clearWorkspaceCache(): void {
    workspaceCache = null
    folderCache = null
}

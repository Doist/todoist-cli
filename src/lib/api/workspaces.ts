import { getApiToken } from '../auth.js'
import { ensureFresh } from '../sync/engine.js'

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

async function fetchWorkspaceData(): Promise<{
    workspaces: Workspace[]
    folders: WorkspaceFolder[]
}> {
    const repo = await ensureFresh(['workspaces', 'folders'])
    if (repo) {
        const [workspaces, folders] = await Promise.all([repo.listWorkspaces(), repo.listFolders()])
        return { workspaces, folders }
    }

    if (workspaceCache !== null && folderCache !== null) {
        return { workspaces: workspaceCache, folders: folderCache }
    }

    const token = await getApiToken()
    const response = await fetch('https://api.todoist.com/api/v1/sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: '*',
            resource_types: '["workspaces","folders"]',
        }),
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch workspace data: ${response.status}`)
    }

    const data = await response.json()
    if (data.error) {
        throw new Error(`Workspace API error: ${data.error}`)
    }

    const workspaces = (data.workspaces ?? []).map((w: Record<string, unknown>) => ({
        id: String(w.id),
        name: w.name,
        role: w.role,
        plan: w.plan,
        domainName: w.domain_name ?? null,
        currentMemberCount: w.current_member_count ?? 0,
        currentActiveProjects: w.current_active_projects ?? 0,
        memberCountByType: {
            adminCount: (w.member_count_by_type as Record<string, number>)?.admin_count ?? 0,
            memberCount: (w.member_count_by_type as Record<string, number>)?.member_count ?? 0,
            guestCount: (w.member_count_by_type as Record<string, number>)?.guest_count ?? 0,
        },
    }))

    const folders = (data.folders ?? []).map((f: Record<string, unknown>) => ({
        id: String(f.id),
        name: String(f.name),
        workspaceId: String(f.workspace_id),
    }))

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

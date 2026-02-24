import { CORE_SYNC_RESOURCES } from './types.js'

interface SqlStatement {
    sql: string
    args?: Array<string | number | boolean | null>
}

interface SqlClient {
    execute(statement: string | SqlStatement): Promise<unknown>
}

export const SCHEMA_VERSION = 1

export const CACHE_TABLES = [
    'tasks',
    'projects',
    'sections',
    'labels',
    'users',
    'filters',
    'workspaces',
    'folders',
    'workspace_users',
    'project_collaborators',
] as const

async function executeAll(client: SqlClient, statements: string[]): Promise<void> {
    for (const sql of statements) {
        await client.execute(sql)
    }
}

export async function runMigrations(client: SqlClient): Promise<void> {
    await executeAll(client, [
        `CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS sync_state (
            resource TEXT PRIMARY KEY,
            dirty INTEGER NOT NULL DEFAULT 1,
            last_synced_at TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            content TEXT NOT NULL,
            project_id TEXT NOT NULL,
            section_id TEXT,
            parent_id TEXT,
            priority INTEGER NOT NULL,
            due_date TEXT,
            responsible_uid TEXT,
            checked INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            workspace_id TEXT,
            folder_id TEXT,
            parent_id TEXT,
            is_shared INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS sections (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            project_id TEXT NOT NULL,
            section_order INTEGER
        )`,
        `CREATE TABLE IF NOT EXISTS labels (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            full_name TEXT,
            email TEXT,
            inbox_project_id TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS filters (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            query TEXT NOT NULL,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT,
            plan TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            workspace_id TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS workspace_users (
            workspace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS project_collaborators (
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            data TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (project_id, user_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_section_id ON tasks(section_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_responsible_uid ON tasks(responsible_uid)`,
        `CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id)`,
        `CREATE INDEX IF NOT EXISTS idx_projects_folder_id ON projects(folder_id)`,
        `CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON projects(parent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_sections_project_id ON sections(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_filters_name ON filters(name)`,
        `CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name)`,
        `CREATE INDEX IF NOT EXISTS idx_folders_workspace_id ON folders(workspace_id)`,
        `CREATE INDEX IF NOT EXISTS idx_workspace_users_workspace_id ON workspace_users(workspace_id)`,
        `CREATE INDEX IF NOT EXISTS idx_project_collaborators_project_id ON project_collaborators(project_id)`,
    ])

    await client.execute({
        sql: `INSERT INTO meta(key, value) VALUES ('schema_version', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [String(SCHEMA_VERSION)],
    })

    for (const resource of CORE_SYNC_RESOURCES) {
        await client.execute({
            sql: `INSERT OR IGNORE INTO sync_state(resource, dirty, last_synced_at)
                  VALUES (?, 1, NULL)`,
            args: [resource],
        })
    }
}

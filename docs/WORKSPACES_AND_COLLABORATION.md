# Workspaces and Collaboration Implementation Spec

## Quick Reference

| Feature | Command / Flag | Notes |
|---------|---------------|-------|
| List workspaces | `td workspace list` | Silent if empty |
| View workspace | `td workspace view <ref>` | Fuzzy match supported |
| Workspace projects | `td workspace projects <ref>` | Nested tree with folders |
| Workspace users | `td workspace users <ref>` | --role ADMIN,MEMBER filter |
| Project collaborators | `td project collaborators <ref>` | Errors on non-shared |
| Assign task | `--assignee <ref>` or `--assignee me` | Works on add/update |
| Unassign task | `--unassign` | Dedicated flag |
| Filter by assignee | `--assignee <ref>` | On task list commands |
| Filter unassigned | `--unassigned` | Tasks with no assignee |
| Show all assignees | `--any-assignee` | Override default filter |
| Filter by workspace | `--workspace <ref>` | Mutually exclusive with --personal |
| Filter personal | `--personal` | Non-workspace projects only |

---

## Design Decisions

### Display Format

**Assignee display**: `+FirstName L.` (consistent with Todoist quick-add syntax)
- Examples: `+Andrew W.`, `+Craig M.`, `+Madonna` (single word = no initial)
- For orphan assignees (removed users): `+330121` (raw ID)

**Project indicators**:
- Workspace projects: `[WorkspaceName]`
- Shared personal projects: `[shared]`
- Non-shared personal: no indicator

**Project status** (workspace projects only): `[IN_PROGRESS]` - nice-to-have if easy to implement

### Default Behavior: Today & Upcoming

`td today` and `td upcoming` default to showing only:
- Tasks assigned to current user ("me")
- Tasks with no assignee (unassigned)

This excludes tasks assigned to other collaborators. Override with `--any-assignee`.

Applies to all projects (personal and workspace).

### Assignee Resolution

**'me' keyword**: Supported for both assigning (`--assignee me`) and filtering (`--assignee me`).

**Fuzzy matching**: Partial name match allowed. If ambiguous (multiple matches), error with list of matching names. No hints about valid collaborators on error.

**Non-shared projects**: Error "Cannot assign tasks in non-shared projects" when attempting to assign.

### Collaborator Fetching Strategy

1. **Scan first**: Before rendering, identify all unique projects that have tasks with non-null assignee_id
2. **Batch by context**:
   - Workspace projects → fetch workspace users once per workspace (covers all projects)
   - Shared personal projects → fetch collaborators per project
3. **Parallel fetch**: All API calls in parallel
4. **Session cache**: Cache results in memory, reuse within same CLI invocation
5. **Lazy for workspaces**: Only fetch workspace names if some projects have non-null workspace_id

### Current User ID

Lazy fetch + session cache. Only call API when 'me' keyword is used, then cache for remainder of session.

### JSON Output

Include resolved user objects (id, name, email) if already fetched during normal processing. Don't do extra API calls just for JSON mode.

---

## Implementation Phases

### Phase 1: Workspace Commands (Foundation)

Build the foundation for workspace awareness.

#### 1.1 Sync API Helper

Add to `src/lib/api.ts`:
- `fetchWorkspaces(token)` - raw Sync API call for workspace list
- Returns: `{ id, name, plan, role, memberCount, projectCount }`

#### 1.2 `td workspace list`

```
td workspace list

69   Doist (BUSINESS) - 143 members, 497 projects [MEMBER]
132  Playground (STARTER) - 2 members, 2 projects [ADMIN]
```

- Silent output if no workspaces
- `--json` / `--ndjson` / `--full` output modes

#### 1.3 `td workspace view <ref>`

```
td workspace view "Doist"

Doist

ID:       69
Plan:     BUSINESS
Role:     MEMBER
Domain:   doist.com
Members:  143 (3 admins, 124 members, 16 guests)
Projects: 497 active
```

- Fuzzy name matching supported
- `id:69` for explicit ID

#### 1.4 `td workspace projects <ref>`

```
td workspace projects "Doist"

Engineering/
  2355951627  26Q1: Automation [IN_PROGRESS]
  2345678901  Backend Refactor [IN_PROGRESS]
Marketing/
  2456789012  Q1 Campaign [COMPLETED]
(no folder)
  2567890123  General Discussion
```

- Nested tree view with folders as headers
- Only show non-empty folders
- Root projects shown under "(no folder)"

#### 1.5 `td workspace users <ref>`

```
td workspace users "Doist"
td workspace users id:69 --role ADMIN,MEMBER

330121  Andrew W. <andrew@doist.com> [ADMIN]
330122  Craig M. <craig@doist.com> [MEMBER]
```

- Always show user IDs
- `--role` filter accepts multiple: `--role ADMIN,MEMBER`

**Files**:
- `src/commands/workspace.ts` (new)
- `src/lib/api.ts` (add Sync API helper)

---

### Phase 2: Assignee Display

Show who tasks are assigned to.

#### 2.1 Task Listing Enhancement

Modify `src/lib/task-list.ts` and `src/lib/output.ts`:

```
td today

Overdue (2)
  9619267364  p1  Usage-based limits +Andrew W.
  9578893836  p2  Add tool listing +Craig M.

Today (3)
  1234567890  p3  Review PR
```

- Format: `+FirstName L.`
- Single-word names: `+Madonna`
- Orphan assignees: `+330121`

#### 2.2 Collaborator Cache

Add `src/lib/collaborators.ts`:
- `CollaboratorCache` class with methods:
  - `preload(api, tasks)` - scan tasks, batch fetch collaborators
  - `getUserName(userId, projectId)` - lookup from cache
  - `resolveAssignee(api, projectId, ref)` - resolve name/email/id to user ID

#### 2.3 Default Filter for Today/Upcoming

Modify `src/commands/today.ts` and `src/commands/upcoming.ts`:
- Default: only show tasks where `assignee_id` is null OR equals current user ID
- Add `--any-assignee` flag to show all tasks

**Files**:
- `src/lib/task-list.ts`
- `src/lib/output.ts`
- `src/lib/collaborators.ts` (new)
- `src/commands/today.ts`
- `src/commands/upcoming.ts`

---

### Phase 3: Assignment Commands

Enable assigning/unassigning tasks.

#### 3.1 Add `--assignee` Flag

```bash
td task add --content "Review PR" --project "Backend" --assignee "Andrew"
td task add --content "Review PR" --project "Backend" --assignee me
td add "Review PR #Backend" --assignee "Andrew"  # quick-add supported
```

- Resolve assignee: `id:xxx` → literal, else match by email, then by name
- 'me' keyword resolves to current user
- Error if project is not shared

#### 3.2 Add `--unassign` Flag

```bash
td task update id:123 --unassign
```

- Dedicated flag to remove assignee
- Clear and explicit

#### 3.3 Assignee Filtering

```bash
td task list --assignee "Andrew"
td task list --assignee me
td task list --unassigned
```

**Files**:
- `src/commands/task.ts`
- `src/commands/add.ts`
- `src/lib/collaborators.ts`
- `src/lib/current-user.ts` (new - lazy fetch current user ID)

---

### Phase 4: Project Enhancements

#### 4.1 Project Indicators

```
td project list

2323370738  1:1 Paul-Ernesto [shared]
2355951627  26Q1: Automation [Doist]
2245415234  🏠 Personal
2206355491  Inbox
```

- Lazy fetch workspace names (only if needed)

#### 4.2 `td project collaborators <ref>`

```bash
td project collaborators "1:1 Paul-Ernesto"

21857330  Ernesto G. <ernesto@doist.com>
55700935  Daniel G. <daniel@example.com>
```

- Error on non-shared projects: "Project is not shared"
- Always show user IDs

#### 4.3 Enhanced `td project view`

For workspace projects, show additional info:
```
td project view "26Q1: Automation"

26Q1: Automation Acceleration

ID:         2355951627
Workspace:  Doist
Folder:     Engineering
Status:     IN_PROGRESS
Role:       MEMBER
...

Collaborators (143):
  Andrew W., Craig M., Paul S., ... and 140 more

Tasks (12):
  p1  Usage-based limits +Andrew W.
  ...
```

- Show first N collaborator names + "...and X more"

**Files**:
- `src/commands/project.ts`
- `src/lib/output.ts`

---

### Phase 5: Workspace/Personal Filters

#### 5.1 Project Filters

```bash
td project list --workspace "Doist"
td project list --personal
```

- Mutually exclusive: error if both specified

#### 5.2 Task Filters

```bash
td task list --workspace "Doist"
td today --workspace "Doist"
td task list --personal
```

**Files**:
- `src/commands/project.ts`
- `src/commands/task.ts`
- `src/commands/today.ts`
- `src/commands/upcoming.ts`

---

## Data Structures

### Workspace Cache

```typescript
interface WorkspaceInfo {
  id: string
  name: string
  plan: string
  role: 'ADMIN' | 'MEMBER' | 'GUEST'
  memberCount: number
  projectCount: number
}

// Session cache
const workspaceCache = new Map<string, WorkspaceInfo>()
```

### Collaborator Cache

```typescript
interface CollaboratorCache {
  // workspace_id -> users (for workspace projects)
  workspaceUsers: Map<string, User[]>

  // project_id -> collaborators (for shared personal projects)
  projectCollaborators: Map<string, User[]>

  // Resolved name lookups
  getUserName(userId: string, projectId: string): string | null
}
```

### Current User

```typescript
// Lazy-loaded, cached for session
let currentUserId: string | null = null

async function getCurrentUserId(api: TodoistApi): Promise<string> {
  if (currentUserId) return currentUserId
  // Fetch from API, cache, return
}
```

---

## Testing Strategy

After each phase, verify:

1. **Phase 1**: `td workspace list/view/projects/users` work correctly
2. **Phase 2**: Task listings show `+Name` format, today/upcoming filter correctly
3. **Phase 3**: `--assignee` and `--unassign` work, filters work
4. **Phase 4**: Project indicators and collaborator listing work
5. **Phase 5**: Workspace/personal filters work

### Edge Cases to Test

- User with no workspaces
- Workspace with no folders
- Orphan assignees (removed collaborators)
- Ambiguous name matches
- Assignment on non-shared project (should error)
- Single-word collaborator names
- Very long workspace/project/collaborator names

---

## API Reference

### REST API v2 (via TypeScript library)

| Method | Use |
|--------|-----|
| `getProjects()` | List all projects (returns PersonalProject \| WorkspaceProject) |
| `getProjectCollaborators(projectId)` | Get collaborators for shared project |
| `addTask({ assigneeId })` | Create task with assignee |
| `updateTask(id, { assigneeId })` | Update task assignee |
| `getWorkspaceUsers({ workspaceId })` | Get workspace members |

### Sync API v9 (raw fetch)

| Endpoint | Use |
|----------|-----|
| `POST /sync` with `resource_types=["workspaces"]` | Get workspace list |

---

## Revision History

- **2026-01-09**: Comprehensive spec with UX decisions from interview

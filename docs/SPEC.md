# Todoist CLI Specification

## Overview

A TypeScript CLI for Todoist, installable via `npm install -g @doist/todoist-cli`. Binary name: `td`. Designed for both humans and AI agents, following `gh` CLI patterns.

## Authentication

- **Primary**: `TODOIST_API_TOKEN` environment variable
- **Fallback**: `~/.config/todoist-cli/config.json` (XDG-compliant)
- **Dev-only**: `.env` file in project directory (not production behavior)
- OAuth device flow: deferred to future version

## Command Structure

Pattern: `td <resource> <action> [args]` (like `gh pr view`)

### Top-level Shortcuts
- `td add "text"` — Quick add with natural language parsing (maps to quick-add API)

### Task Commands
```
td task list [--project X] [--priority p1] [--due today] [--filter "query"] [--limit N] [--json|--ndjson]
td task add --content "text" --due "date" --priority p1 --project X [--section Y] [--labels a,b] [--parent id:123] [--description "..."]
td task view <ref> [--full]
td task update <ref> [--content "..."] [--due "..."] [--priority p1] [...]
td task complete <ref>
td task delete <ref> --yes
```

### Project Commands
```
td project list [--json]
td project view <name|id:xxx>
```

## Reference Syntax

### Tasks & Projects
- **Fuzzy name match**: `td task complete "buy milk"` — partial match, fail if ambiguous
- **Explicit ID**: `td task complete id:8234567890` — unambiguous, prefix required
- On match failure: exit with error + show closest suggestions

### Priorities
- Format: `p1`, `p2`, `p3`, `p4` (p1 = highest, p4 = none)
- The `p` prefix is **mandatory** — bare numbers not accepted

### Dates
- Natural language: `tomorrow`, `next friday 5pm`, `in 2 days`
- ISO format: `2024-01-15`
- Both accepted, Todoist API parses

## Output

### Human-readable (default)
- Columns for `task list`: ID, priority (colored), content, due date, project
- Tasks grouped by section when listing within a project
- Colors enabled by default, respect `NO_COLOR` env var
- Descriptions shown as raw markdown (render later)

### Machine-readable
- `--json`: JSON array `[{task1}, {task2}]`
- `--ndjson`: Newline-delimited JSON for streaming

### View Command
- Default: essential fields + full description
- `--full`: all fields including metadata (creator, created_at, etc.)

## Error Handling

- **Format**: Structured with hints
  ```
  Error: TASK_NOT_FOUND
  Task "buy mulk" not found. Did you mean:
    - "buy milk" (id:12345)
    - "buy books" (id:67890)
  ```
- **Exit codes**: 0 = success, 1 = any error (simple)
- **Rate limiting**: Fail fast, let user retry

## Filters

- **Flag-based** (common cases):
  ```
  td task list --project Work --priority p1 --due today
  ```
- **Raw filter** (power users):
  ```
  td task list --filter "today & #Work & @urgent"
  ```

## Pagination

- API pagination handled internally
- Default sensible limit, show cursor info for fetching more in output
- `--limit N` to control

## Scope

### v1 (MVP)
- **Task**: list, add (quick), add (strict), view, update, complete, delete
- **Project**: list, view
- Full subtask support (--parent flag, hierarchy display)
- Labels: must exist before use (no auto-creation), full resource management (`td label list/create/delete`)

### Post-v1
- Comments on tasks
- Shell completions (bash/zsh/fish)
- OAuth device flow auth
- `td auth status` / `td whoami`

### Excluded
- Reminders (Pro-only feature)
- Offline/sync API (REST sufficient)

## Behavioral Details

| Scenario | Behavior |
|----------|----------|
| `td task delete` without `--yes` | Error, require confirmation flag |
| `td task complete` on completed task | Exit 0, message "Task already completed" |
| Recurring task completed | Trust Todoist, show next due in output |
| Timezone display | Use account timezone from Todoist settings |
| Multiple fuzzy matches | Error with suggestions, user must disambiguate |

## Technical Decisions

- **API**: REST v2 (simpler, sufficient for MVP)
- **Framework**: Commander.js, Oclif, or Yargs (implementer's choice based on fit)
- **Testing**: Minimal for v1, focus on shipping
- **TypeScript**: Strict, avoid `any` and forced casts
- **Package**: `@doist/todoist-cli` on npm

## CLI Help

```
td --help              # List all commands
td <command> --help    # Command-specific help
```

All commands must have comprehensive `--help` output for AI discoverability.

## Config File Structure

Location: `~/.config/todoist-cli/config.json`

```json
{
  "api_token": "xxx"
}
```

No "default project" config — always explicit, Inbox is default.

---

## Future Considerations

### Stdin JSON Input (post-v1)

For complex operations (especially AI-driven), support `--stdin` flag to read JSON payload from stdin instead of individual flags:

```bash
# Task creation
echo '{"content":"Meeting notes","description":"Long...","due":"tomorrow","priority":"p1","labels":["work"]}' | td task add --stdin

# Filtering
echo '{"project":"Work","priority":["p1","p2"],"labels":["urgent"]}' | td task list --stdin

# Using heredoc
td task add --stdin <<< '{"content":"Quick task"}'
```

**Rationale:** Avoids shell escaping issues with inline JSON, cleaner for AI agents, no ambiguity since `--stdin` is explicit opt-in. Flags remain primary for human use and discoverability.

---

## API Implementation Notes

**Quick-add requires Sync API:** REST API v2 only parses `due_string` for dates. Full natural language parsing requires the Sync API endpoint:

```
POST https://api.todoist.com/sync/v9/quick/add
Content-Type: application/x-www-form-urlencoded
Authorization: Bearer <token>

text=Buy milk tomorrow p1 #Shopping @errands
```

The `text` parameter parses:
- Projects: `#ProjectName`
- Labels: `@label`
- Priority: `p1`, `p2`, `p3`, `p4`
- Due dates: natural language ("tomorrow", "next friday")
- Deadlines: `{in 3 days}`
- Description: `// description text`

**TypeScript client:** `todoist-api-typescript` is REST-only. Use direct fetch for quick-add.

**Approach:**
- `td add` → Sync API `/sync/v9/quick/add` (direct fetch)
- `td task add` (strict) → REST API v2 / TypeScript client

Docs: https://developer.todoist.com/sync/v9/

---

## Implementation Phases

Implement in phases, stopping after each to verify before continuing:

**Phase 1: Foundation + proof of life**
- Project setup (TypeScript, CLI framework, build pipeline)
- Auth (env var → config file token loading)
- API client wrappers (REST + Sync quick-add)
- `td task list` end-to-end
- **Stop and verify the stack works**

**Phase 2: Task commands**
- `td add` (quick-add with natural language)
- `td task add` (strict with flags)
- `td task view`, `td task update`, `td task complete`, `td task delete`
- **Stop for sanity check**

**Phase 3: Project commands + polish**
- `td project list`, `td project view`
- Error hints with suggestions
- Colors, help text
- **Done**

Once Phase 1 works, the rest is mostly pattern replication.

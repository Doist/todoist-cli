# Todoist CLI

TypeScript CLI for Todoist. Binary name: `td`.

## Build & Run

```bash
npm run build       # compile TypeScript (uses tsconfig.build.json, excludes tests)
npm run dev         # watch mode (uses tsconfig.build.json)
npm run type-check  # type check source + tests (uses tsconfig.json)
npm run check       # lint + format check
npm run fix         # auto-fix lint + format
npm test            # run tests
```

**Two-tsconfig setup:** `tsconfig.json` includes both source and test files — used by `type-check` and IDEs. `tsconfig.build.json` extends it but excludes colocated `*.test.ts` files plus `src/test-support/` — used by `build` and `dev` to keep test-only code out of `dist/`.

**Run the CLI directly** (no linking needed):

```bash
node dist/index.js --help          # show commands
node dist/index.js today           # run 'today' command
node dist/index.js <command> ...   # run any command
```

Use this to verify changes work before committing.

## Architecture

```
src/
  index.ts              # entry point, registers all commands
  commands/             # command groups (folders for multi-subcommand, flat files for single)
    add.ts              # td add (quick add)
    auth/               # td auth (login, token, status, logout)
    completion/         # td completion (install/uninstall shell completions)
    today.ts            # td today
    inbox.ts            # td inbox
    task/               # td task <action> — 11 subcommands
    project/            # td project <action> — 19 subcommands
    label/              # td label <action>
    filter/             # td filter <action>
    view.ts             # td view <url> (URL router)
    comment/            # td comment <action>
    section/            # td section <action>
    ...                 # + notification/, workspace/, reminder/, settings/, stats/, skill/
  lib/
    api.ts              # API client wrapper, type exports
    auth.ts             # token loading/saving (env var or config file)
    completion.ts       # Commander tree-walker for shell completions
    output.ts           # formatting utilities
    refs.ts             # id: prefix parsing, URL parsing/classification, ref resolution
    urls.ts             # Todoist web app URL builders
    task-list.ts        # shared task listing logic
  types/
    pnpm-tabtab.d.ts    # type declarations for @pnpm/tabtab
```

## Key Patterns

- **Ref resolution** (`src/lib/refs.ts`): Entity references are resolved through three strategies:
    - **Full name resolution** (`resolveRef` wrappers — `resolveTaskRef`, `resolveProjectRef`): Async, returns the full entity object. Tries URL → `id:` prefix → exact name match → partial substring match → raw ID fallback. Use for entities with user-facing names. Add new wrappers in `refs.ts` — `resolveRef` is private.
    - **ID-only validation** (`lenientIdRef`): Synchronous, no API calls, returns an ID string. Tries `id:` prefix → URL → raw ID → error. Use for entities without a `fetchAll` endpoint (e.g., comments, reminders).
    - **Context-scoped resolution** (`resolveSectionId`, `resolveParentTaskId`, `resolveWorkspaceRef`): Async, searches within a parent context (e.g., sections within a project). Each has custom logic in `refs.ts`.
    - **Shared helpers**:
        - `looksLikeRawId()` decides when a ref is tried as an ID — pure alpha strings (`"Work"`) and strings with spaces are names; mixed alphanumeric without spaces (`"abc123"`) are potential IDs
        - `parseTodoistUrl()` extracts IDs from web URLs (task, project, label, filter)
- **Implicit view subcommand**: `td project <ref>` defaults to `td project view <ref>` via Commander's `{ isDefault: true }`. Same for task, workspace, comment, notification. Edge case: if a project/task name matches a subcommand name (e.g., "list"), the subcommand wins — user must use `td project view list`
- **Named flag aliases**: Where commands accept positional args for context (project, task, workspace), named flags are also accepted (`--project`, `--task`, `--workspace`). Error if both positional and flag are provided
- **API responses**: Client returns `{ results: T[], nextCursor? }` - always destructure
- **Priority mapping**: API uses 4=p1 (highest), 1=p4 (lowest)
- **Command registration**: Each command exports `registerXxxCommand(program: Command)` function from its `index.ts` (folder-based commands) or top-level `.ts` file (flat commands). Folder-based commands split each subcommand into its own file with the index.ts wiring them to Commander.

## Testing

Tests use vitest with mocked API. Run `npm test` before committing.

- Tests are colocated next to the command or lib module they cover (for example `src/commands/task/index.test.ts` or `src/lib/refs.test.ts`)
- Shared test helpers live in `src/test-support/` (`mock-api.ts`, `fixtures.ts`)
- When adding features, add corresponding tests
- Pattern: mock `getApi`, use `program.parseAsync()` to test commands

## Auth

Token from `TODOIST_API_TOKEN` env var or `~/.config/todoist-cli/config.json`:

```json
{ "api_token": "your-api-token" }
```

## Skill Content (Agent Command Reference)

The file `src/lib/skills/content.ts` exports `SKILL_CONTENT` — a comprehensive command reference that gets installed into AI agent skill directories via `td skill install`. This is the source of truth that agents use to understand available CLI commands.

**Whenever commands, subcommands, flags, or options are added, updated, or removed in `src/commands/`, the `SKILL_CONTENT` in `src/lib/skills/content.ts` must be updated to match.** This includes:

- Adding new commands or subcommands with usage examples
- Adding, removing, or renaming flags and options
- Updating the Quick Reference section when new top-level commands are introduced
- Keeping examples accurate and consistent with actual CLI behavior

After updating `SKILL_CONTENT`:

1. Run `npm run sync:skill` to regenerate `skills/todoist-cli/SKILL.md` (builds automatically)
2. Run `td skill update claude-code` (and any other installed agents) to propagate changes to installed skill files

A CI check (`npm run check:skill-sync`) runs on pull requests and will fail if `skills/todoist-cli/SKILL.md` is out of sync with `content.ts`.

## JSON Output for Mutating Commands

All add/create/update commands support `--json` to output the created or updated entity as machine-readable JSON instead of the default human-readable confirmation message. This applies to:

- `task add`, `task update`
- `project create`, `project update`
- `comment add`, `comment update`
- `label create`, `label update`
- `filter create`
- `section create`, `section update`
- `reminder add`

**When adding new add/create/update commands**, always include a `--json` flag that outputs the resulting entity using `formatJson(result, entityType)` from `src/lib/output.ts`. The pattern is:

```typescript
const result = await api.addXxx(args)
if (options.json) {
    console.log(formatJson(result, 'entityType'))
    return
}
// normal human-readable output
```

Delete, complete, uncomplete, archive, and unarchive commands do not support `--json` as they return no meaningful entity data.

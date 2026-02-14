# Todoist CLI

TypeScript CLI for Todoist. Binary name: `td`.

## Build & Run

```bash
npm run build       # compile TypeScript
npm run dev         # watch mode
npm run type-check  # type check
npm run format      # format code
npm test            # run tests
```

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
  commands/             # one file per command group
    add.ts              # td add (quick add)
    auth.ts             # td auth (login, token, status, logout)
    completion.ts       # td completion (install/uninstall shell completions)
    today.ts            # td today
    inbox.ts            # td inbox
    task.ts             # td task <action>
    project.ts          # td project <action>
    label.ts            # td label <action>
    filter.ts           # td filter <action>
    comment.ts          # td comment <action>
    section.ts          # td section <action>
  lib/
    api.ts              # API client wrapper, type exports
    auth.ts             # token loading/saving (env var or config file)
    completion.ts       # Commander tree-walker for shell completions
    output.ts           # formatting utilities
    refs.ts             # id: prefix parsing, URL parsing, ref resolution
    urls.ts             # Todoist web app URL builders
    task-list.ts        # shared task listing logic
  types/
    pnpm-tabtab.d.ts    # type declarations for @pnpm/tabtab
```

## Key Patterns

- **Lenient ID handling**: Raw IDs (alphanumeric or numeric) are accepted everywhere without `id:` prefix. Todoist web app URLs for tasks, projects, labels, and filters are also accepted — `parseTodoistUrl()` extracts the ID from the URL slug. `lenientIdRef()` accepts `id:xxx`, URLs, or raw ID-like strings, rejects plain text. `resolveRef()` auto-retries raw IDs as direct lookups before giving up. Use `isIdRef()`/`extractId()` for mixed refs (fuzzy name + explicit ID)
- **Implicit view subcommand**: `td project <ref>` defaults to `td project view <ref>` via Commander's `{ isDefault: true }`. Same for task, workspace, comment, notification. Edge case: if a project/task name matches a subcommand name (e.g., "list"), the subcommand wins — user must use `td project view list`
- **Named flag aliases**: Where commands accept positional args for context (project, task, workspace), named flags are also accepted (`--project`, `--task`, `--workspace`). Error if both positional and flag are provided
- **API responses**: Client returns `{ results: T[], nextCursor? }` - always destructure
- **Priority mapping**: API uses 4=p1 (highest), 1=p4 (lowest)
- **Command registration**: Each command exports `registerXxxCommand(program: Command)` function

## Testing

Tests use vitest with mocked API. Run `npm test` before committing.

- All commands and lib modules have tests in `src/__tests__/`
- Shared mock factory in `helpers/mock-api.ts`, fixtures in `helpers/fixtures.ts`
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

After updating `SKILL_CONTENT`, run `td skill update claude-code` (and any other installed agents) to propagate the changes to installed skill files.

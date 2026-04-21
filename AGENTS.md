# Todoist CLI

> For repo structure, where things live, and shared utilities, read
> [CODEBASE.md](./CODEBASE.md) first. This file covers the **rules**;
> CODEBASE.md is the **map**.

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

## Rules when changing code

- **Named flag aliases:** where commands accept positional args for context (project, task, workspace), named flags (`--project`, `--task`, `--workspace`) are also accepted. Error if both positional and flag are provided.
- **Implicit `view` subcommand edge case:** `td project <ref>` defaults to `td project view <ref>`. If a project/task name matches a subcommand name (e.g., `"list"`), the subcommand wins — users must use `td project view list`.
- **API response shape:** client returns `{ results: T[], nextCursor? }` — always destructure.
- **Priority mapping:** CLI uses `"p1"`–`"p4"` strings; API uses 4=p1 (highest), 1=p4 (lowest). Use `parsePriority` from `src/lib/task-list.ts`, never hand-roll.
- **Errors:** throw `CliError(code, message, hints?)` from `src/lib/errors.ts` for anything user-facing. The global `parseAsync().catch` in `src/index.ts` renders it correctly in JSON and pretty modes.

## Testing

Tests use vitest with mocked API. Run `npm test` before committing.

- Co-locate tests next to the command or lib module they cover.
- When adding features, add corresponding tests.
- See CODEBASE.md for the mock-api + fixtures setup.

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

## Keeping CODEBASE.md accurate

`CODEBASE.md` is a structural map, not a file index. Update it when **structure** changes — not on every new file. Triggers:

- new top-level dir under `src/`, or a new command-group folder
- a new broadly-reusable helper in `src/lib/` (the "don't reimplement" catalog)
- changes to command registration, auth/token storage, or build/test/release tooling

Adding a single subcommand to an existing group, or a narrowly-scoped helper used by one caller, does not require an update.

# Todoist CLI

> For repo structure, where things live, and shared utilities, read
> [CODEBASE.md](./CODEBASE.md) first. This file covers the **rules**;
> CODEBASE.md is the **map**.

TypeScript CLI for Todoist. Binary name: `td`.

## Definition of done

- **Done means proven:** a test that failed before the change and passes after, or the command's real output (`node dist/index.js <command>`, on a test account). For a refactor: tests that pin the behaviour, passing before and after. Reading code or a passing compile is not proof.
- **Run `npm run verify` before calling a change done.** It runs every check CI runs, in about fifteen seconds, and records the pass. It prints what it cannot see, and says when only docs changed and there is nothing to check.
- **Never weaken a check to pass it.** Don't skip, delete or loosen tests, edit lint, type or test config to get green, or use `--no-verify`. If a check looks wrong, say so and stop.
- **Report honestly:** what ran, what it showed, and what you did not verify.

## Skills

Use the matching skill without being asked. They live in `.agents/skills/` (Claude Code reads them through `.claude/skills/`).

- `verify`: before saying a change is done, fixed or ready.
- `fix-bug`: something is broken or wrong.
- `build-feature`: a new command, flag or behaviour.
- `add-command`: the checklist of files to touch for a new command or subcommand.
- `refactor`: changing structure without changing behaviour. Other tasks send restructuring here, as a separate change.
- `write-tests`: writing or changing tests; `.agents/skills/write-tests/references/test-rules.md` is the quality bar.
- `learn`: after a correction, to turn it into a check.
- `review-changes`: when the owner says a change is ready for a PR, or asks for a review.

## Review checks

Reviewers, Doistbot included, apply these to every change:

- [Tests](.agents/checks/tests.md): not weakened, new behaviour tested.
- [Architecture](.agents/checks/architecture.md): rules lint can't express.
- [Security](.agents/checks/security.md): the token, read-only mode, extensions, shelling out.
- [Privacy and secrets](.agents/checks/privacy.md): this repository is public.
- [Command surface](.agents/checks/command-surface.md): what people, scripts and agents see.
- [Evidence](.agents/checks/evidence.md): claims backed by what ran.

## Build & Run

```bash
npm run build       # compile TypeScript (uses tsconfig.build.json, excludes tests)
npm run dev         # watch mode (uses tsconfig.build.json)
npm run type-check  # type check source + tests (tsconfig.json) and the agent tooling (.agents/scripts)
npm run check       # lint + format check
npm run fix         # auto-fix lint + format
npm test            # run tests
npm run verify      # every check CI runs (lint, format, types, tests, build, skill sync)
```

**Two-tsconfig setup:** `tsconfig.json` includes both source and test files — used by `type-check` and IDEs. `tsconfig.build.json` extends it but excludes colocated `*.test.ts` files plus `src/test-support/` — used by `build` and `dev` to keep test-only code out of `dist/`.

**Run the CLI directly** (no linking needed):

```bash
node dist/index.js --help          # show commands
node dist/index.js today           # run 'today' command
node dist/index.js <command> ...   # run any command
```

Use this to see a change working, on top of `npm run verify`.

## Rules when changing code

- **Named flag aliases:** where commands accept positional args for context (project, task, workspace), named flags (`--project`, `--task`, `--workspace`) are also accepted. Error if both positional and flag are provided.
- **Implicit `view` subcommand edge case:** `td project <ref>` defaults to `td project view <ref>`. If a project/task name matches a subcommand name (e.g., `"list"`), the subcommand wins — users must use `td project view list`.
- **API response shape:** client returns `{ results: T[], nextCursor? }` — always destructure.
- **Priority mapping:** CLI uses `"p1"`–`"p4"` strings; API uses 4=p1 (highest), 1=p4 (lowest). Use `parsePriority` from `src/lib/task-list.ts`, never hand-roll.
- **Errors:** throw `CliError(code, message, hints?)` from `src/lib/errors.ts` for anything user-facing. The global `parseAsync().catch` in `src/index.ts` renders it correctly in JSON and pretty modes. The same handler also matches `BaseCliError` (re-exported from `src/lib/errors.ts`) so errors thrown by `@doist/cli-core` helpers route through the same formatter.

## Testing

Tests use vitest with mocked API. `npm run verify` runs them with every other CI check.

- Co-locate tests next to the command or lib module they cover.
- When adding features, add corresponding tests.
- See CODEBASE.md for the mock-api + fixtures setup.

## Git hooks and agent tooling

- Commits and pushes to `main` are refused by the git hooks. Work on a branch.
- Agent tooling lives in `.agents/scripts/`, never in `scripts/` (which ships in the npm package).
- How it all fits together: [`docs/agents.md`](docs/agents.md).

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

Entity add/create/update commands support `--json` to output the created or updated entity as machine-readable JSON instead of the default human-readable confirmation message. This applies to:

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

Delete, complete, uncomplete, archive, and unarchive commands support `--json` through
`src/lib/mutation-json.ts`. Since they return no entity, successful writes emit
`ok`, `command`, and `messages`. Dry runs emit `status: "preview"`, `command`, and
`messages`, without claiming success. Add new no-entity mutations to that registry.
Errors are rendered by the global JSON error handler.

## Keeping CODEBASE.md accurate

`CODEBASE.md` is a structural map, not a file index. Update it when **structure** changes — not on every new file. Triggers:

- new top-level dir under `src/`, or a new command-group folder
- a new broadly-reusable helper in `src/lib/` (the "don't reimplement" catalog)
- changes to command registration, auth/token storage, or build/test/release tooling

Adding a single subcommand to an existing group, or a narrowly-scoped helper used by one caller, does not require an update.

## Changing the CLI icon

Follow [docs/icon.md](docs/icon.md). The consent-screen icon is stored on the Todoist CLI app, not read from `icons/`, so replacing the repo file alone does not change it. Never rename or delete files in `icons/`.

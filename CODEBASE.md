# CODEBASE.md — Repo Map

> **Purpose:** a ~2000-token orientation file so Claude (and humans) can navigate
> this repo without exploring. Describes _what is where_; `AGENTS.md` describes
> _how to change things_. Update when structure shifts, not on every new file.

## What this project is

`@doist/todoist-cli` is a **TypeScript CLI** for Todoist. Binary name: `td`. It
wraps `@doist/todoist-sdk` and publishes a single executable (`dist/index.js`).

ESM-only · Node ≥ 20.18.1 · Commander 14 · vitest · oxlint + oxfmt (no
eslint/prettier) · semantic-release on merge to `main`.

## Top-level layout

```
/
├─ src/                   # All source. See tree below.
├─ scripts/               # sync-skill.js, check-skill-sync.js, postinstall.js
├─ dist/                  # Build output (tsc). Never edit.
├─ skills/todoist-cli/    # Generated SKILL.md (from src/lib/skills/content.ts)
├─ .github/workflows/     # test.yml, lint.yml, release.yml, check-skill-sync.yml,
│                         # check-semantic-pull-request.yml, update-todoist-sdk.yml,
│                         # issue-automation.yml, request-reviews.yml
├─ AGENTS.md              # Prescriptive rules (build cmds, skill-sync, JSON flag)
├─ CODEBASE.md            # This file — descriptive map
├─ CLAUDE.md              # One-liner forward to AGENTS.md
├─ tsconfig.json          # Includes src + tests (used by type-check, IDE)
├─ tsconfig.build.json    # Excludes *.test.ts + test-support/ (used by build/dev)
├─ vitest.config.ts       # Test runner config
├─ .oxlintrc.json / .oxfmtrc.json
├─ lefthook.yml           # Pre-commit hooks
└─ release.config.js      # semantic-release config
```

## `src/` tree

```
src/
├─ index.ts               # Entry: Commander setup, lazy command registry, early spinner
├─ postinstall.ts         # Runs after npm install (welcome, update check)
├─ commands/              # One file per flat command, one folder per group
│  ├─ add.ts, today.ts, upcoming.ts, inbox.ts, view.ts,
│  │  doctor.ts, changelog.ts, activity.ts, attachment.ts
│  ├─ goal.ts             # Flat command with subcommand registry inside
│  ├─ task/, project/, label/, comment/, section/, filter/,
│  │  reminder/, workspace/, folder/, notification/, template/,
│  │  backup/, apps/, stats/, completed/, auth/, settings/,
│  │  config/, skill/, hc/, completion/, update/
│  └─ *.test.ts           # Co-located tests
├─ lib/                   # Shared utilities. See catalog — don't reimplement.
│  ├─ api/                # SDK wrapper + typed helpers (core, filters, workspaces,
│  │                      # notifications, reminders, stats, user-settings, uploads)
│  └─ skills/             # content.ts (SKILL_CONTENT), create-installer.ts
└─ test-support/
   ├─ mock-api.ts         # createMockApi() — vitest mocks of every SDK method
   └─ fixtures.ts         # Sample task/project/label/section fixtures
```

## Architecture flow

1. `src/index.ts` sets `program.name('td')`, registers global flags
   (`--quiet`, `--accessible`, `--progress-jsonl`, `-v`/`--verbose`, `--no-spinner`),
   and builds a **lazy command registry** — a `Record<name, [description, loader]>`.
2. Placeholder subcommands are registered so `--help` lists everything without
   importing anything.
3. The invoked command name is extracted from `process.argv`; only its loader
   runs (`./commands/<name>.js` for flat commands, `./commands/<name>/index.js`
   for groups), then the real `registerXxxCommand(program)` replaces the
   placeholder.
4. If output will be human-readable, `preloadMarkdown()` runs in parallel with
   the command import. `startEarlySpinner()` covers the import latency.
5. `program.parseAsync()` runs the command's action handler. Uncaught
   `CliError` is rendered via `formatError()` or `formatErrorJson()` depending
   on `isJsonMode()`.

## Command registration pattern

- **Flat command** (e.g. `today.ts`): exports `registerTodayCommand(program)`
  that calls `program.command('today')` and attaches an action handler.
- **Group command** (e.g. `task/`): `index.ts` exports
  `registerTaskCommand(program)`, creates `const task = program.command('task')`,
  then calls `task.command('<sub>')` for each subcommand — each subcommand's
  logic lives in a sibling file (`task/add.ts`, `task/list.ts`, …) re-imported
  by `index.ts`. Shared helpers live in `task/helpers.ts`.
- **Implicit `view` subcommand**: most group commands register
  `.command('view [ref]', { isDefault: true })` so `td project <ref>`
  dispatches to `td project view <ref>`. Same for task, workspace, comment,
  notification, filter, label, folder, apps, attachment, hc.

## Commands catalog (grouped domains)

Command files are flat/kebab-case in `src/commands/`. Subcommand enumeration
lives in `src/lib/skills/content.ts` (SKILL_CONTENT) — don't duplicate here.

- **Tasks** — add, list, view, complete, uncomplete, delete, move, reschedule,
  quickadd, browse, update (+ top-level `add` quick-task shortcut)
- **Projects** — incl. archive/unarchive, join, collaborators, permissions,
  activity-stats, health, analyze-health
- **Labels, Sections, Comments, Filters, Reminders, Folders, Templates** —
  standard CRUD + browse
- **Goals** — list, view, create, update, delete, complete, uncomplete,
  link/unlink tasks
- **Workspaces** — list/view + workspace users + access management
- **Notifications** — list/view/accept/reject/dismiss
- **Productivity & activity** — `activity`, `stats`, `completed`
- **Top-level views** — `today`, `upcoming`, `inbox`, `view` (URL router)
- **Infra** — `auth` (login/logout/token/status), `settings`, `apps`,
  `backup`, `attachment`, `hc` (Help Center), `skill`, `completion`, `update`,
  `doctor`, `changelog`

New subcommand? Copy a sibling in the target group, wire it in that group's
`index.ts`, update `SKILL_CONTENT`, run `npm run sync:skill`. See AGENTS.md.

## `src/lib/` catalog — don't reimplement

- **`api/core.ts`** — `getApi()` (SDK client factory), re-exports `Task`,
  `Project`, `Section`, `User`. Paginated response shape
  `{ results, nextCursor }` lives in `pagination.ts`.
- **`api/` siblings** — `filters.ts`, `workspaces.ts`, `notifications.ts`,
  `reminders.ts`, `stats.ts`, `user-settings.ts`, `uploads.ts`
- **`auth.ts`** — read-side resolver: `resolveActiveUser`, `getApiToken`,
  `probeApiToken`, `getAuthMetadata`, `listStoredUsers`, `NoTokenError`. All
  write/clear paths go through `auth-store.ts`.
- **`auth-flags.ts`** — `buildReloginCommand()` (rebuilds `td auth login`
  with `--read-only` / `--additional-scopes=...` preserved)
- **`config.ts`** — `~/.config/todoist-cli/config.json` read/write,
  `stripLegacyAuthFields`, `AuthMode`, `UpdateChannel`, `AUTH_FLAG_ORDER`.
- **`auth-provider.ts`** — `createTodoistAuthProvider()`: cli-core PKCE
  provider with Todoist `validateToken` (builds `auth_mode` / `auth_scope` /
  `auth_flags` from `getUser`).
- **`auth-store.ts`** — `createTodoistTokenStore()` (cli-core
  `createKeyringTokenStore` wired to the `UserRecordStore` adapter),
  persisted identifier constants (`SERVICE_NAME`, `LEGACY_ACCOUNT`,
  `accountForUser`), and `toTodoistAccount()` mapper.
- **`user-records.ts`** — `UserRecordStore<TodoistAccount>` adapter over
  the config file. REPLACE-not-merge `upsert`; `ensureV2` on every write.
- **`migrate-auth.ts`** — postinstall v1 → v2 migration; thin wrapper
  around cli-core's `migrateLegacyAuth` with the Todoist callbacks.
- **`auth-html.ts`** — branded HTML pages for the cli-core OAuth callback
  (`renderAuthSuccessPage` / `renderAuthErrorPage`)
- **`oauth-scopes.ts`** — opt-in OAuth scope registry, `parseScopesOption`,
  `extractAdditionalScopes`, `resolveAuthScope`, `formatScopesHelp`
- **`output.ts`** — `formatTaskRow`, `formatTaskView`, `formatJson`,
  `formatNdjson`, `formatPaginatedJson`, `processJsonItem` (essential-field
  picker used by JSON callers that build composite payloads), `formatDueDate`,
  `formatPriority`, `formatError`, `formatErrorJson`, `printDryRun`
- **`refs.ts`** — `isIdRef`, `extractId`, `looksLikeRawId`, `lenientIdRef`,
  `resolveTaskRef`, `resolveProjectRef`, `resolveProjectId`,
  `resolveSectionId`, `resolveParentTaskId`, `resolveWorkspaceRef`,
  `resolveFolderRef`, `resolveAppRef`, `resolveGoalRef`, `resolveFromList`,
  `parseTodoistUrl`, `classifyTodoistUrl`
- **`reorder.ts`** — `validateReorderPlacement()` for shared
  `--before` / `--after` / `--position` validation.
- **`urls.ts`** — `taskUrl`, `projectUrl`, `labelUrl`, `sectionUrl`,
  `commentUrl`, `filterUrl`
- **`task-list.ts`** — `fetchProjects`, `filterByWorkspaceOrPersonal`,
  `parsePriority`, `PRIORITY_CHOICES` (`"p1"`–`"p4"`; internally p1→4, p4→1)
- **`pagination.ts`** — `paginate()`, `LIMITS` (tasks: 300, projects: 50, …)
- **`completion.ts`** — `parseCompLine`, `getCompletions`,
  `withCaseInsensitiveChoices`, `withUnvalidatedChoices` (Commander tree-walker)
- **`spinner.ts`** — `startEarlySpinner`, `LoadingSpinner` class
  (yocto-spinner wrapper)
- **`markdown.ts`** — `preloadMarkdown`, markdown → terminal renderer
- **`errors.ts`** — `CliError(code, message, hints?)`, `ErrorType` union
- **`collaborators.ts`** — `CollaboratorCache`, `formatAssignee`,
  `resolveAssigneeId`
- **`global-args.ts`** — `isJsonMode`, `isNdjsonMode`, `isRawMode`,
  `isQuiet`, `isAccessible`, progress-jsonl target
- **`logger.ts`** — verbose levels 0–4, `initializeLogger`
- **`dates.ts` / `duration.ts`** — date filters, `"2h30m"` parsing/formatting
- **`permissions.ts`** — collaborator permission parsing
- **`help-center.ts`** — Help Center article search/fetch
- **`progress.ts`** — `--progress-jsonl` JSONL event writer
- **`local-file.ts`** — `openLocalFileAsBlob()`: file-backed `Blob` for
  multipart uploads (used by `comment add --file`, `template create
--file`, `template import-file`). Maps fs errors to `FILE_NOT_FOUND` /
  `FILE_READ_ERROR` CliErrors.
- **`usage-tracking.ts`** — request/session metadata headers, CLI command
  attribution, tracked fetch wrappers
- **`browser.ts` / `stdin.ts` / `update.ts`** — small single-purpose helpers
- **`skills/content.ts`** — `SKILL_NAME`, `SKILL_DESCRIPTION`, `SKILL_CONTENT`

## Canonical examples

- **Simple read:** `src/commands/today.ts` — `getApi()` → filter query →
  `paginate()` → `formatTaskRow()`. Supports `--json`, `--ndjson`,
  `--workspace`, `--personal`, `--cursor`, `--limit`.
- **Write with `--json`:** `src/commands/task/add.ts` — resolves
  project/section/parent refs via `refs.ts` and the assignee via
  `resolveAssigneeId()` from `src/lib/collaborators.ts`, calls `api.addTask()`,
  outputs `formatJson(result, 'task')` when `--json`, else human confirmation.
- **Grouped command:** `src/commands/project/index.ts` + siblings —
  implicit-default `view`, sibling files per subcommand, `project/helpers.ts`
  for shared logic.

## Ref resolution (three strategies)

All live in `src/lib/refs.ts`:

1. **Full name resolution** (`resolveProjectRef`, `resolveTaskRef`, …) —
   async, returns the full entity. Tries URL → `id:` prefix → exact name →
   partial substring → raw ID fallback. Use for entities with user-facing names.
   Add new wrappers in `refs.ts`; the internal `resolveRef` is private.
2. **ID-only validation** (`lenientIdRef`) — sync, no API call, returns an ID
   string. Tries `id:` prefix → URL → raw ID → error. Use for entities without
   a `fetchAll` endpoint (comments, reminders).
3. **Context-scoped** (`resolveSectionId`, `resolveParentTaskId`,
   `resolveWorkspaceRef`) — async, searches within a parent context.

`looksLikeRawId()` decides when a ref should be tried as an ID: pure-alpha
(`"Work"`) and spaced strings are names; mixed alphanumeric without spaces
(`"abc123"`) are potential IDs.

## Auth & token storage

`@doist/cli-core/auth` owns the keyring, multi-user `TokenStore`, OAuth flow,
and the `login` / `logout` / `status` / `token view` registrars. todoist-cli
supplies a `UserRecordStore<TodoistAccount>` adapter (`user-records.ts`) over
its config file plus a Todoist-specific `validateToken` (`auth-provider.ts`).

Read path (`auth.ts` — `resolveActiveUser` / `getApiToken` / `probeApiToken`):
env `TODOIST_API_TOKEN` first, then a config-derived target user, then either
`StoredUser.api_token` (plaintext keyring-offline fallback) or cli-core's
`createSecureStore` for the keyring slot.

Write/clear/list all route through `createTodoistTokenStore()`; commands never
write the config directly. `auth logout` and `auth token view` use
`withUserRefAware` (`commands/auth/store-wrap.ts`) to substitute the
global `--user <ref>` that `index.ts` strips from argv before commander runs.

v1 → v2 migration (`migrate-auth.ts` → cli-core's `migrateLegacyAuth`) runs
from `postinstall.ts`. Gate is `config.config_version === CONFIG_VERSION`,
which survives logout so a reinstall over a logged-out v2 install can't
re-migrate a stale legacy slot.

## Testing

- **Runner:** vitest. `npm test` (one-shot), `npm run test:watch`.
- **Location:** co-located `*.test.ts` next to the module under test.
- **Mocks:** `src/test-support/mock-api.ts` — `createMockApi()` returns
  vitest-mocked versions of every SDK method. Use factories from
  `src/test-support/fixtures.ts` — do NOT hand-build mock entities.
- **Pattern:** mock `getApi` via `vi.mock`, then `program.parseAsync(['node','td','<cmd>',…])`.
- **`@doist/cli-core` inlining:** `vitest.config.ts` lists `@doist/cli-core` in
  `server.deps.inline` so `vi.doMock('node:fs/promises', …)` /
  `vi.doMock('node:os', …)` reach cli-core's compiled imports. Without it
  vitest treats the package as external and Node's native resolver bypasses
  the mock substitution, breaking the `auth` / `migrate-auth` suites.

## Build & release

- **Build:** `tsc -p tsconfig.build.json` (`dist/`). Two-tsconfig setup:
  `tsconfig.json` includes tests for type-check/IDEs; `tsconfig.build.json`
  excludes `*.test.ts` + `src/test-support/` so test-only code stays out of
  `dist/`.
- **Dev:** `npm run dev` (watch mode).
- **Type-check:** `npm run type-check` (runs `tsc --noEmit`).
- **Lint/format:** `npm run check` (`oxlint src && oxfmt --check`),
  `npm run fix` (`oxlint src --fix && oxfmt`). **No ESLint, no Prettier.**
- **Pre-commit:** lefthook (`lefthook.yml`).
- **Release:** semantic-release on merge to `main` (`.github/workflows/release.yml`).
  Commits must follow Conventional Commits — enforced by
  `check-semantic-pull-request.yml`.

## Skill content flow

`src/lib/skills/content.ts` is the **source of truth** for every command
reference shown to AI agents. The build/sync chain:

1. Edit `SKILL_CONTENT` when commands/flags change.
2. `npm run sync:skill` → `scripts/sync-skill.js` → writes
   `skills/todoist-cli/SKILL.md`.
3. `td skill update claude-code` (and other installed agents) propagates
   the update to installed skill files.
4. `.github/workflows/check-skill-sync.yml` runs `npm run check:skill-sync`
   on PRs — fails if `SKILL.md` is out of sync with `content.ts`.

See AGENTS.md for the exact update rule.

## Running the CLI directly (no install)

```bash
node dist/index.js --help
node dist/index.js today
node dist/index.js <cmd> ...
```

Uses the same token lookup as the installed `td` binary — env var, config
file, or a token stored in the OS credential manager via `td auth login`.

## Conventions (quick)

- Filenames: **kebab-case** (`find-completed-tasks.ts`)
- No barrel files except per-group `index.ts` wiring Commander
- Priority: **`"p1"`–`"p4"` strings in CLI**; API uses 4=p1 (highest) → 1=p4
- API responses: always destructure `{ results, nextCursor }` from the SDK
- Mutating commands (`add`/`create`/`update`): always support `--json`
  emitting `formatJson(result, entityType)` — see AGENTS.md
- User-facing errors: throw `CliError(code, message, hints?)` from
  `src/lib/errors.ts`; the global `parseAsync().catch` in `src/index.ts`
  renders it. The same handler also catches `BaseCliError` (re-exported
  from `src/lib/errors.ts`) so errors thrown by `@doist/cli-core` helpers
  route through the same path
- Global flags handled in `src/lib/global-args.ts` — check `isJsonMode()` etc.
  before printing

## Start here if new

1. `src/index.ts` — entry + command registry
2. `src/commands/today.ts` — canonical read
3. `src/commands/task/add.ts` — canonical write with `--json`
4. `src/commands/project/index.ts` — canonical group command
5. `src/lib/refs.ts` + `src/lib/output.ts` — what's already built
6. `AGENTS.md` — rules you must follow

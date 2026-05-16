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
│                         # issue-automation.yml, request-reviews.yml,
│                         # sync-next-with-main.yml
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
- **`auth.ts`** — read-side resolver. `resolveActiveUser()`, `getApiToken()`,
  `probeApiToken()`, `getAuthMetadata()`, `listStoredUsers()`, `NoTokenError`.
  Also `clearLegacyToken()` for the unmigrated-v1 `td auth logout` path
  (transitional, drops alongside `resolveLegacyToken`). All write-side
  storage goes through `auth-store.ts` and the `UserRecordStore` adapter —
  do not add new write paths here.
- **`auth-flags.ts`** — `buildReloginCommand()` (rebuilds `td auth login`
  with `--read-only` / `--additional-scopes=...` preserved)
- **`config.ts`** — `~/.config/todoist-cli/config.json` read/write,
  `AuthMode`, `UpdateChannel`, `AUTH_FLAG_ORDER`. Also `stripLegacyAuthFields()`
  — single source of truth for the v1 top-level fields scrubbed on every v2
  write (`api_token`, `auth_mode`, `auth_scope`, `auth_flags`,
  `pendingSecureStoreClear`).
- **`auth-provider.ts`** — `createTodoistAuthProvider()`: `@doist/cli-core`
  PKCE `AuthProvider` adapter with a Todoist-specific `validateToken`
  (calls `getUser`, builds `auth_mode` / `auth_scope` / `auth_flags`)
- **`auth-store.ts`** — central auth-storage module. `createTodoistTokenStore()`
  wires `@doist/cli-core/auth`'s `createKeyringTokenStore` (the keyring-backed
  multi-account `TokenStore`) against the `UserRecordStore` adapter in
  `user-records.ts`. Exports the persisted-identifier constants
  (`SERVICE_NAME = 'todoist-cli'`, `LEGACY_ACCOUNT = 'api-token'`,
  `accountForUser(id) → 'user-${id}'`) so read/write/migration paths share one
  source of truth. Also exports `toTodoistAccount()` — the single account-shape
  mapper used by login, migration, and the record-store adapter.
- **`user-records.ts`** — `createTodoistUserRecordStore()`: the
  `UserRecordStore<TodoistAccount>` port cli-core's `createKeyringTokenStore`
  reads/writes through. REPLACE-not-merge `upsert`; every write runs through
  `ensureV2` (stamps `config_version`, defaults `users` to `[]`, strips legacy
  fields via `stripLegacyAuthFields`). Array manipulation delegates to
  `users.ts` (`upsertStoredUser`, `removeStoredUser`, `setDefaultUser`,
  `clearDefaultUser`) so on-disk config mutation has one set of mutators.
- **`migrate-auth.ts`** — one-time v1 → v2 migration. Thin wrapper around
  `@doist/cli-core/auth`'s `migrateLegacyAuth`, supplying the Todoist callbacks
  (`hasMigrated` / `markMigrated` gated on `config_version === CONFIG_VERSION`,
  `/api/v1/user` `identifyAccount`, `cleanupLegacyConfig` via
  `stripLegacyAuthFields`). Invoked from `src/postinstall.ts`.
- **`auth-html.ts`** — branded HTML pages for the cli-core OAuth callback
  (`renderAuthSuccessPage` / `renderAuthErrorPage`)
- **`oauth-scopes.ts`** — opt-in OAuth scope registry, `parseScopesOption`,
  `extractAdditionalScopes`, `resolveAuthScope`, `formatScopesHelp`
- **`output.ts`** — `formatTaskRow`, `formatTaskView`, `formatJson`,
  `formatNdjson`, `formatPaginatedJson`, `formatDueDate`, `formatPriority`,
  `formatError`, `formatErrorJson`, `printDryRun`
- **`refs.ts`** — `isIdRef`, `extractId`, `looksLikeRawId`, `lenientIdRef`,
  `resolveTaskRef`, `resolveProjectRef`, `resolveProjectId`,
  `resolveSectionId`, `resolveParentTaskId`, `resolveWorkspaceRef`,
  `resolveFolderRef`, `resolveAppRef`, `parseTodoistUrl`, `classifyTodoistUrl`
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

Multi-user storage is owned by `@doist/cli-core/auth`. todoist-cli supplies a
`UserRecordStore<TodoistAccount>` adapter (`src/lib/user-records.ts`) over its
config file; cli-core's `createKeyringTokenStore` owns the keyring writes,
fallback handling, and `--user <ref>` resolution. Persisted identifiers
(`SERVICE_NAME = 'todoist-cli'`, per-user slug `user-<id>`, legacy v1 slug
`api-token`) live in `src/lib/auth-store.ts`.

Read path — `resolveActiveUser()` / `getApiToken()` / `probeApiToken()`
(`src/lib/auth.ts`):

1. `TODOIST_API_TOKEN` env var
2. `config.users[]` record — prefers `api_token` (plaintext fallback, present
   only when keyring was unavailable at write time), otherwise reads the
   keyring slot via cli-core's `createSecureStore`
3. **v1 fallback (transitional):** when `config.users` is not an array, read
   the legacy top-level `api_token` / `api-token` keyring slot. This keeps
   unmigrated installs working when postinstall migration hasn't run yet
   (offline first run, etc.). Removed once `migrate-auth.ts` has had time to
   land on every install.

Write/clear paths (login, `td auth token`, `td user remove`, `td user use`,
`td auth logout`) all go through `createTodoistTokenStore()` — never write
the config directly. `td auth logout` is wrapped in
`src/commands/auth/logout.ts` to thread the global `--user <ref>` into
`store.clear`, surface `UserNotFoundError` on miss, and fall back to
`clearLegacyToken()` for unmigrated v1 installs.

`td auth login` runs through `@doist/cli-core`'s OAuth runtime
(`attachLoginCommand` → `runOAuthFlow`). The Todoist-local pieces live in
`src/lib/auth-provider.ts` (PKCE provider + `validateToken`) and
`src/lib/auth-store.ts` (cli-core `TokenStore<TodoistAccount>` factory);
the command is attached in `src/commands/auth/login.ts`. cli-core wires the
standard flags (`--read-only`, `--callback-port`, `--json`, `--ndjson`) and
binds the local callback server on port `8765` with a small fallback range.
Scopes are opt-in: `--read-only` for a read-only token,
`--additional-scopes=app-management,backups` to broaden.

v1 → v2 migration runs from `src/postinstall.ts` via `src/lib/migrate-auth.ts`
(thin wrapper around cli-core's `migrateLegacyAuth`). The one-way gate is
`config.config_version === CONFIG_VERSION`, which survives logout, so a
reinstall over a logged-out v2 install can't re-migrate a stale legacy
keyring entry.

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
- **Prerelease sync:** `sync-next-with-main.yml` opens (or updates) a
  `chore: merge main into next` PR whenever `main` is ahead of `next`. Runs
  on push to `main`, daily at 09:00 UTC, and `workflow_dispatch`. Clean
  merges go through the standard PR CI; conflicts are committed with
  markers and surfaced in the PR body for manual resolution. Idempotent —
  skips reruns when the existing sync branch already merges the current
  `main`/`next` tips, and refuses to overwrite branches whose HEAD was not
  authored by the bot.

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

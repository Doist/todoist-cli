---
name: add-command
description: Guide for adding new CLI commands or subcommands to todoist-cli. Use when implementing new SDK endpoints, adding subcommands to existing command groups, or extending CLI functionality.
---

# Adding a New CLI Command or Subcommand

Follow this checklist when adding new commands. Each step references the exact file to modify.

## 1. Mock API (`src/__tests__/helpers/mock-api.ts`)

Add a mock for each new SDK method in `createMockApi()`. Place it in the correct entity group.

- List/read methods: `.mockResolvedValue({ results: [], nextCursor: null })` or appropriate empty default
- Mutation methods: `vi.fn()` (no default return needed)

## 2. Spinner Messages (`src/lib/api/core.ts`)

Add an entry to `API_SPINNER_MESSAGES` for each new SDK method.

Color convention:

- `blue` — read/fetch operations
- `green` — create/join operations
- `yellow` — update/delete/archive mutations

## 3. Read-Only Permissions (`src/lib/permissions.ts`)

If the new command uses a **read-only** SDK method (e.g., `getXxx`, `listXxx`), add it to the `KNOWN_SAFE_API_METHODS` set. This set uses a default-deny approach: any method **not** listed is treated as mutating and will be blocked when the CLI is authenticated with a read-only OAuth token (`td auth login --read-only`).

- **Read-only methods** (fetch/list/view): add to `KNOWN_SAFE_API_METHODS`
- **Mutating methods** (add/update/delete/archive/move): do NOT add — they are blocked by default, which is the correct behavior

## 4. Agent-Friendly Design Checklist

Every new command should satisfy these properties. They ensure the CLI works well for both humans and AI agents. See [7 Principles for Agent-Friendly CLIs](https://trevinsays.com/p/7-principles-for-agent-friendly-clis) for background.

1. **Non-interactive by default** — All input via flags, positional args, or `--stdin`. Never use `readline`, `prompt()`, or block waiting for TTY input. When a required argument is missing, call `cmd.help()` and return — don't prompt.

2. **Structured, parseable output** — Data commands must support `--json` (and `--ndjson` for lists). Results go to stdout, diagnostics to stderr. Spinners auto-suppress when `!process.stdout.isTTY` (see `src/lib/spinner.ts`). Exit code 0 on success, non-zero on failure.

3. **Fail fast with actionable errors** — Use `CliError` with a specific error code, a message naming the exact problem, and hints that include correct invocation syntax, valid values, or example commands. Validate all inputs before making API calls.

4. **Safe retries and explicit mutation boundaries** — Mutating commands support `--dry-run`. Destructive + irreversible commands require `--yes`. Create/update commands return the entity ID (use `isQuiet()` for bare ID output for scripting, e.g. `id=$(td task add "Buy milk" -q)`).

5. **Progressive help discovery** — Parent command groups include `.addHelpText('after', ...)` with 2–3 concrete examples. Every `.description()` is a clear one-line purpose statement. When a required positional arg is missing, show help via `cmd.help()`.

6. **Composable and predictable structure** — Use consistent subcommand verbs (`list`/`view`/`create`/`update`/`delete`/`browse`). Use consistent flag names across entities (`--project <ref>`, `--json`, `--dry-run`, `--yes`, `--limit`, `--cursor`, `--all`). Support `--stdin` for text content where applicable (see `readStdin()` in `src/lib/stdin.ts`).

7. **Bounded, high-signal responses** — List commands use `paginate()` from `src/lib/pagination.ts` with `--limit <n>`, `--cursor`, and `--all` flags. When results are truncated, `formatNextCursorFooter()` tells the user how to fetch more. JSON output uses `pickFields()` to return essential fields by default, with `--full` for complete output.

## 5. Command Implementation (`src/commands/<entity>/`)

Commands with multiple subcommands use a folder-based structure:

```
src/commands/<entity>/
  index.ts          # registerXxxCommand — creates parent cmd, wires subcommands
  list.ts           # async function listXxx(...) — one file per subcommand
  view.ts           # async function viewXxx(...)
  create.ts         # async function createXxx(...)
  helpers.ts        # shared constants/utilities used by multiple subcommands (optional)
```

- **index.ts**: Imports all subcommand handlers, creates the Commander tree, exports `registerXxxCommand`
- **Subcommand files**: Export one async action handler + any option interfaces. Use `../../lib/` for lib imports. No Commander imports (only index.ts uses Commander).
- **helpers.ts**: Only needed when multiple subcommands share a utility/constant.

Single-subcommand commands (e.g., `add.ts`, `today.ts`) remain as flat files.

### Adding a subcommand to an existing command

1. Create a new file `src/commands/<entity>/<action>.ts` with the handler function
2. Import and wire it in `src/commands/<entity>/index.ts`

### Flag conventions

| Command type                   | Flags                                                    |
| ------------------------------ | -------------------------------------------------------- |
| Read-only                      | `--json` (and `--ndjson` for lists)                      |
| Mutating (returns entity)      | `--json` (use `formatJson`), `--dry-run`                 |
| Mutating (no return)           | `--dry-run`                                              |
| Destructive + irreversible     | `--yes`, `--dry-run`                                     |
| Reversible (archive/unarchive) | `--dry-run` (no `--yes`)                                 |
| List commands                  | `--limit <n>`, `--cursor`, `--all`, `--json`, `--ndjson` |

The `--quiet` / `-q` flag suppresses success messages on mutations. Create/update commands in quiet mode print only the bare entity ID for scripting (e.g., `id=$(td task add "Buy milk" -q)`).

### Error handling

Always use `CliError` from `src/lib/errors.ts` instead of bare `throw new Error(...)`. This ensures structured error output in JSON mode and consistent formatting in text mode.

```typescript
import { CliError } from '../../lib/errors.js'

throw new CliError('ERROR_CODE', 'User-facing message', ['Optional hint'])
```

When adding a new error code, add it to the `ErrorCode` type in `src/lib/errors.ts` under the appropriate category. The type provides intellisense for known codes while accepting any string for dynamic codes.

To make errors actionable for agents:

- The `message` must name the specific problem (not generic "invalid input")
- The `hints` array should include at least one of: correct invocation syntax, valid values, or a working example command
- Validate all flag constraints and input early — before any API calls. If flags conflict, throw `CliError('CONFLICTING_OPTIONS', ...)` immediately

### ID resolution

- `resolveXxxRef(api, ref)` — when the user knows the entity by name (projects, tasks, labels). Add new wrappers in `refs.ts` — `resolveRef` is private.
- `lenientIdRef(ref, 'entity')` — when there is no list endpoint for lookup, or the user can't access the entity yet (e.g., comments, reminders, joining an unjoined project)
- **Context-scoped resolvers** (`resolveSectionId`, `resolveParentTaskId`, `resolveWorkspaceRef`) — when resolving a name within a parent context (e.g., a section name within a specific project). Each has custom logic in `refs.ts`.

### Subcommand registration pattern

```typescript
const myCmd = parent
    .command('my-action [ref]')
    .description('Do something')
    .option('--json', 'Output as JSON')
    .option('--dry-run', 'Preview what would happen without executing')
    .action((ref, options) => {
        if (!ref) {
            myCmd.help()
            return
        }
        return myAction(ref, options)
    })
```

The variable assignment (`const myCmd = ...`) is needed so the `.action()` callback can call `myCmd.help()` when the argument is missing.

Help text quality:

- Parent command groups (the `registerXxxCommand` function) should include `.addHelpText('after', ...)` with 2–3 concrete invocation examples
- Every `.description()` string should be a clear one-line purpose — agents read this to decide which subcommand to call
- The `if (!ref) { cmd.help(); return }` pattern ensures the command never blocks when a required argument is missing

## 6. Accessibility (`src/lib/output.ts`)

The CLI supports accessible mode via `isAccessible()` (checks `TD_ACCESSIBLE=1` or `--accessible` flag). When adding output that uses color or visual elements, consider whether information is conveyed **only** by color or decoration.

### When to add accessible alternatives

- **Color-coded status/severity**: If color conveys meaning (e.g., green=good, red=bad), add a text prefix or label in accessible mode so the meaning is available without color. Example: `formatHealthStatus` adds `[+]`, `[!]`, `[!!]` prefixes.
- **ASCII art / visual bars**: Omit entirely in accessible mode — screen readers read each character individually (e.g., `====----` becomes "equals equals equals equals dash dash dash dash"). Show only the numeric value instead.
- **Decorative symbols**: Stars, checkmarks, or icons used alongside color should have text equivalents. Example: favorites get `★` only in accessible mode since the yellow color already signals it visually.

### When you don't need to do anything

- **Text that is already descriptive**: Status names like `ON_TRACK`, `COMPLETED` are self-explanatory — color just reinforces them. Still consider adding indicator prefixes for severity.
- **Plain numbers and dates**: Already accessible.
- **Dim/styled labels**: `chalk.dim()` for secondary info is fine — screen readers ignore styling.

### Pattern

```typescript
import { isAccessible } from '../lib/output.js'

// For color-coded values: add text prefix in accessible mode
const a11y = isAccessible()
const prefix = a11y ? '[!] ' : ''
console.log(chalk.yellow(`${prefix}AT_RISK`))

// For visual bars: skip entirely in accessible mode
if (isAccessible()) {
    console.log(`${percent}%`)
} else {
    console.log(`[${'='.repeat(filled)}${'-'.repeat(empty)}] ${percent}%`)
}
```

If adding a new shared formatter to `output.ts`, use `Record<ExactType, ...>` rather than `Record<string, ...>` so the compiler catches missing variants.

## 7. Tests (`src/__tests__/<entity>.test.ts`)

Follow the existing pattern: mock `getApi`, use `program.parseAsync()`.

Always test:

- Happy path (correct output, correct API call)
- `INVALID_REF` rejection for `lenientIdRef` commands (plain text like `"Planning"` should fail)
- `--dry-run` for mutating commands (API method should NOT be called, preview text shown)
- `--json` output where applicable

## 8. Skill Content (`src/lib/skills/content.ts`)

Update `SKILL_CONTENT` with examples for the new command. Update relevant sections:

- Command examples in the entity's `### Section` block
- Quick Reference if adding a top-level command
- Mutating `--json` list if the command returns an entity
- `--dry-run` list if applicable

## 9. Sync Skill File

After all code changes are complete:

```bash
npm run sync:skill
```

This builds the project and regenerates `skills/todoist-cli/SKILL.md` from the compiled skill content. The regenerated file must be committed. CI will fail (`npm run check:skill-sync`) if it is out of sync.

## 10. Verify

```bash
npm run type-check
npm test
npm run check
```

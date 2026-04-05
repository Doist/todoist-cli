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

## 4. Command Implementation (`src/commands/<entity>/`)

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

| Command type                   | Flags                                    |
| ------------------------------ | ---------------------------------------- |
| Read-only                      | `--json` (and `--ndjson` for lists)      |
| Mutating (returns entity)      | `--json` (use `formatJson`), `--dry-run` |
| Mutating (no return)           | `--dry-run`                              |
| Destructive + irreversible     | `--yes`, `--dry-run`                     |
| Reversible (archive/unarchive) | `--dry-run` (no `--yes`)                 |

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

## 5. Accessibility (`src/lib/output.ts`)

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

## 6. Tests (`src/__tests__/<entity>.test.ts`)

Follow the existing pattern: mock `getApi`, use `program.parseAsync()`.

Always test:

- Happy path (correct output, correct API call)
- `INVALID_REF` rejection for `lenientIdRef` commands (plain text like `"Planning"` should fail)
- `--dry-run` for mutating commands (API method should NOT be called, preview text shown)
- `--json` output where applicable

## 7. Skill Content (`src/lib/skills/content.ts`)

Update `SKILL_CONTENT` with examples for the new command. Update relevant sections:

- Command examples in the entity's `### Section` block
- Quick Reference if adding a top-level command
- Mutating `--json` list if the command returns an entity
- `--dry-run` list if applicable

## 8. Sync Skill File

After all code changes are complete:

```bash
npm run sync:skill
```

This builds the project and regenerates `skills/todoist-cli/SKILL.md` from the compiled skill content. The regenerated file must be committed. CI will fail (`npm run check:skill-sync`) if it is out of sync.

## 9. Verify

```bash
npm run type-check
npm test
npm run check
```

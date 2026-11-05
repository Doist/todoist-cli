---
name: build-feature
description: Builds a new command, flag or behaviour in thin test-first slices, after settling the open decisions with the owner. Use when asked to "add", "build", "implement", "support" or "create" something, such as a new command, subcommand or flag.
---

# Build a feature

## 1. Read the closest existing feature

Find the command most like the one you are building and read it with its test: `src/commands/task/add.ts` for a write that returns an entity, `src/commands/today.ts` for a list, `src/commands/label/delete.ts` for a destructive write behind `--yes`. For a new command or subcommand, `add-command` is the checklist of every file to touch. Read the rules in `AGENTS.md`. Done when you can name the file you will copy patterns from.

## 2. Settle decisions in one round

List what the request leaves open: command and flag names (consistent verbs and flags across entities; see `docs/decisions/001-lenient-cli-ergonomics.md`), positional argument or named flag, the human and `--json` output, error codes, `--dry-run` and `--yes`, behaviour under a read-only token. Ask the owner all of them at once, each with your recommendation. Don't ask what the code can answer. Done when every decision has an answer.

## 3. Write "done" as checkable behaviours

Write each behaviour as a command and the expected result, for example: "`td label create --name work --json` calls `addLabel` with `{ name: 'work' }` and prints the label as JSON". Each becomes a test. Done when a test could pass or fail on every one.

## 4. Build in thin slices, test first

For each behaviour: write its test at the public interface (`program.parseAsync(['node', 'td', ...])`), see it fail, make it pass, run its test file. Follow `write-tests`. Done when every behaviour from step 3 has a passing test you saw fail.

## 5. Update everything the change touches

| You changed                               | Also update                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A command, subcommand or flag             | `SKILL_CONTENT` in `src/lib/skills/content.ts`, then `npm run sync:skill`                                                                                                         |
| Called a new SDK method                   | `createMockApi()` in `src/test-support/mock-api.ts`, `API_SPINNER_MESSAGES` in `src/lib/api/core.ts`; a read-only one goes in `KNOWN_SAFE_API_METHODS` (`src/lib/permissions.ts`) |
| A mutation that returns an entity         | `--json` through `formatJson(result, '<entity>')`, and the list under "JSON Output for Mutating Commands" in `AGENTS.md`                                                          |
| A delete, complete or archive-style write | Its entry in `src/lib/mutation-json.ts`, so `--json` gets the success envelope                                                                                                    |
| Output that uses colour or symbols        | An `--accessible` alternative (`isAccessible()` from `src/lib/global-args.ts`); in lists, the name first and `(id:…)` after                                                       |
| A new error code                          | The `ErrorCode` type in `src/lib/errors.ts`                                                                                                                                       |
| Structure (new folder or helper)          | `CODEBASE.md`, by its "Keeping CODEBASE.md accurate" rules                                                                                                                        |

Done when each row that applies is handled.

## 6. Verify and report

Follow `verify`. If the feature needs restructuring first, do that as a separate change with `refactor`.

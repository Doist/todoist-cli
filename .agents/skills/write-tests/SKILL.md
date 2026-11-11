---
name: write-tests
description: Writes or changes tests in this repository to its quality bar, with the right helpers and layer. Use when adding, fixing or reviewing tests, when a change "needs a test", or when deciding whether a test may change.
---

# Write tests

## Where tests live

- Next to the code: `src/lib/refs.ts` → `src/lib/refs.test.ts`. A command group has one test file for the group or one per subcommand (`src/commands/label/label.test.ts`, `src/commands/project/reorder.test.ts`). Vitest, globals on, `restoreMocks: true`, so spies restore themselves: no manual `.mockRestore()`.
- Command tests mock the SDK client: `vi.mock('../../lib/api/core.js', () => ({ getApi: vi.fn() }))` at the top, `mockApi = setupApiMock()` in `beforeEach`, a program from `createTestProgram(registerXxxCommand)`, then `program.parseAsync(['node', 'td', ...])`. Capture output with `captureConsole()` or `captureStream()`. Read `src/commands/label/label.test.ts` for the shape.
- `src/index.integration.test.ts` builds the CLI and runs `dist/index.js`, for argv handling, global flags and JSON errors end to end.
- `vi.mock('chalk')` uses the manual mock in `src/__mocks__/chalk.ts`, which makes styling a passthrough so tests read plain text.
- Agent tooling tests live in `.agents/scripts/` and run copies of the tools in throwaway repos (`.agents/scripts/lib/test-repo.ts`).

## Helpers

From `src/test-support/`: `createMockApi`, `setupApiMock`, `fixtures`, `makeFilter`, `createProjectProgram`. From `@todoist/cli-core/testing`: `createTestProgram`, `captureConsole`, `captureStream`, `describeEmptyMachineOutput`. Build entities from `fixtures` instead of by hand; extend it when a test needs a new shape.

## The quality bar

Read [references/test-rules.md](references/test-rules.md) before writing or reviewing a test. In short: a test counts only if it can fail. It asserts outcomes, takes expected values from outside the code under test, mocks only real boundaries, and you saw it fail once.

Done when each new test has failed once for the right reason, and then passes.

## When an existing test may change

- **The behaviour changed on purpose** (a feature or a fix): change the assertions that describe it, and say which in the report.
- **A refactor:** only how the test reaches the code (imports, names, call sites). Never its inputs or assertions, including expected output strings.
- **Never** to make a failing check pass without a behaviour change: no `.skip`, no deleted test, no looser matcher (`toEqual` → `toMatchObject`, exact arguments → `toHaveBeenCalled()`).

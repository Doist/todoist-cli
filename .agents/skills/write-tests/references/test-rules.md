# Test rules

Calibrated on this repository's tests (2,200+ in `src/`, November 2026). Each rule says what to flag and what is fine, because a rule that flags good tests teaches agents to damage them.

## 1. It can fail

You saw the test fail once: before the fix, or with the feature undone. A test that has never failed may be testing nothing.

## 2. It asserts outcomes

Assert what the user sees or what reaches the API: `toHaveBeenCalledWith(<exact args>)`, the exact output line, the parsed `--json` output. Flag an assertion that cannot tell right from wrong.

| Flag                                                                                                     | Fine                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toHaveBeenCalled()` as the only evidence the behaviour happened: nothing checks the arguments or output | `toHaveBeenCalled()` next to assertions on the output, when those carry the test's point (`src/commands/stats/stats.test.ts:59`)                                                      |
|                                                                                                          | `.not.toHaveBeenCalled()`: proves a call did **not** happen (about 300 in this repo, e.g. `label create --dry-run` never reaches `addLabel`, `src/commands/label/label.test.ts:1199`) |
| `toBeDefined()` / `toBeTruthy()` as the last word on a value                                             | The same as a guard right before reading the value's fields (`src/commands/label/label.test.ts:66`, `src/commands/project/reorder.test.ts:263`)                                       |
| A test whose only assertion is that no error was thrown, when the behaviour is a result                  | `resolves.not.toThrow()` when accepting the input **is** the behaviour (a validator that must not reject)                                                                             |

Judge a test by its point, the behaviour its name describes. A weak assertion beside the ones that carry that point is fine.

## 3. Expected values come from outside the code under test

Write the expected value out as literals (a lookup table or `it.each` rows are fine), or build it from `fixtures`. Flag an expectation that calls the code under test, or recomputes the answer the way the code does (the same formatter, string building or mapping function).

## 4. Mock only real boundaries

The real boundary here is the Todoist API: `getApi()` mocked through `vi.mock('…/lib/api/core.js')` and `setupApiMock()`, the standard pattern in every command test. Also boundaries: the API wrapper modules in `src/lib/api/` (`src/lib/api/workspaces.ts`, `src/lib/api/filters.ts`, …), I/O seams (`src/lib/auth.ts`, `src/lib/config.ts`, `process.stdin` through `mockStdin()` from `@doist/cli-core/testing`, `src/lib/browser.ts`, `node:fs/promises`, `chalk`), and the clock (`vi.useFakeTimers`). The auth tests swap `node:os`, `node:fs/promises` and cli-core with `vi.doMock` after `vi.resetModules()` (`src/lib/auth.test.ts:67`); keep that to code that reads the home directory or the keyring.

| Flag                                                                                                        | Fine                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A **new** `vi.mock` of an internal module that holds logic (refs, output, task lists), to make setup easier | The boundaries above. Existing one-offs (`src/commands/template/template.test.ts:13` partly mocks `src/lib/refs.ts`): tolerated, not a pattern to copy |
| Mocking the function the test is about, or one that computes its expected value                             |                                                                                                                                                        |

New tests should prefer feeding `mockApi` over mocking an internal module.

## 5. No skipped or focused tests

None exist today. `.only` fails in CI (`CI=true`, which `npm run verify` sets too). Don't add `.skip`, `.todo` or `xit` to get green. Fine: `it.skipIf` for a platform or permission the test cannot run under, with a comment saying so (`src/lib/local-file.test.ts:124`).

## 6. No fixed sleeps

Use fake timers (`vi.useFakeTimers` and `vi.setSystemTime`, `src/commands/status/status.test.ts:39`) or wait on the event. Fine: a real wait a fake clock cannot drive, such as letting `AbortSignal.timeout` fire (`src/lib/usage-tracking.test.ts:119`), or a short one that proves something did **not** happen.

## 7. No snapshots

None exist: tests assert exact output strings (`toHaveBeenCalledWith('Created: @work')`, `src/commands/label/label.test.ts:419`) or parse JSON output and compare it with `toEqual` (`src/commands/workspace/workspace.test.ts:1010`). Keep it that way. A new snapshot records whatever the output is the first time it runs, so it proves nothing about what the output should be.

## 8. Reading source files is for contracts

Fine: a test that reads source or config to enforce a rule across the codebase (`src/lib/auth-html.test.ts:21` checks the icon URL names a file in this repo; `.agents/scripts/lib/steps.test.ts` reads the workflows). Flag a test that reads a source file to check one function's behaviour; call the function instead.

## 9. No real user data

Fixtures use made-up names, emails and IDs (`fixtures`, `example.com`, `task-1`). This repository is public.

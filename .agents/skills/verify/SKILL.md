---
name: verify
description: Proves a change works before it is called done, and reports the evidence on a ladder from "said" to "ran". Use when you are about to say "done", "fixed", "works" or "ready", when asked to check or test a change, or before opening a pull request.
---

# Verify a change

## 1. Run the checks

```bash
npm run verify
```

It runs every check CI runs (about fifteen seconds) and records the pass. Fix every failure; never weaken a check to pass it. Done when it prints `Verified.`, or says only docs changed and there is nothing to check.

## 2. Prove the change itself

The checks prove nothing broke. Now prove the change does what was asked, with the proof its kind needs:

| Change                                        | Proof                                                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command behaviour (flags → API call → output) | A test next to the command that runs `program.parseAsync(['node', 'td', ...])` and fails without the change (see `src/commands/label/label.test.ts`). Undo the change once and see it fail. |
| A helper in `src/lib/`                        | A test next to it that calls the exported function.                                                                                                                                         |
| `--json` / `--ndjson` output                  | `JSON.parse` the captured output and assert the whole shape with `toEqual`. Scripts and agents read it.                                                                                     |
| Errors, exit codes, argv handling             | Assert the `CliError` code. For global flags and the JSON error envelope of the built CLI, `src/index.integration.test.ts` runs `dist/index.js`.                                            |
| A command or flag added, renamed or removed   | `SKILL_CONTENT` in `src/lib/skills/content.ts` updated and `npm run sync:skill` run; verify's skill-sync step checks the result. `node dist/index.js <command> --help` shows the change.    |
| A real Todoist answer                         | `npm run build`, then `node dist/index.js <command>`, only on a test account. Check `node dist/index.js auth status` first. Ask before writes.                                              |
| Terminal output (colours, spinners, a11y)     | Run the command in a real terminal, with and without `--accessible`. Read it as a screen reader would: names first, ids after, no meaning carried by colour alone.                          |
| Agent tooling (`.agents/scripts`)             | Its tests in throwaway repos, plus one real run of the hook or command.                                                                                                                     |
| Docs only                                     | Every path and command named exists (`ls`, `npm run`).                                                                                                                                      |

Check the proof can fail: undo the change and see the test fail, or run the scenario that used to break. Done when you have seen it fail and then pass. A refactor is the exception: its proof is the pinned tests passing before and after (see `refactor`).

## 3. Report the evidence

Rate every claim on this ladder:

1. **said:** stated without looking.
2. **cited:** the line that shows it (`path:line`).
3. **traced:** followed the code path through each call.
4. **ran:** a test or command executed the code and showed the result.
5. **seen:** observed in the running CLI, in a real terminal or against a real account.

Claims about behaviour ("fixed", "works", "safe", "no regressions") need **ran** or higher. A fact the code shows needs **cited**. Anything lower goes under **Not verified**, with why.

For a change to code others rely on (shared helpers in `src/lib/`, command registration and global flags in `src/index.ts`, an `@todoist/cli-core` or `@doist/todoist-sdk` upgrade), name the one fact that makes it safe, and how you proved it.

Report format:

```
What changed: <one line>
Verified:
- <claim> — ran: <command or test>, <what it showed>
Not verified:
- <claim> — <why>
Safe because: <the one fact>, <how you proved it>   (only for shared code)
```

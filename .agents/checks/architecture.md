# Check: architecture

Rules lint and types can't express. Most are written in `AGENTS.md` and `CODEBASE.md`; report where a change works around one.

## Report

- A user-facing error thrown as a bare `Error` instead of `CliError(code, message, hints?)` from `src/lib/errors.ts`, or a new code missing from the `ErrorCode` type.
- Missing input handled with a bare `command.help()` (stdout, exit 0) instead of `failWithUsage(command)` from `src/lib/missing-argument.ts`.
- An add, create or update command without `--json` (`formatJson(result, '<entity>')`), or a delete, complete or archive-style write missing from `src/lib/mutation-json.ts`.
- A command that prompts or waits for TTY input instead of taking flags, arguments or `--stdin`.
- A read-only SDK method missing from `KNOWN_SAFE_API_METHODS` in `src/lib/permissions.ts` (a read-only token would block it).
- Reference resolution, priority mapping, pagination or output formatting written again instead of using `src/lib/refs.ts`, `parsePriority`, `paginate()` or `src/lib/output.ts`.
- A positional context argument (project, task, workspace) without its named flag alias, or one that accepts both without an error.
- A new top-level command not wired into the lazy registry in `src/index.ts`.
- A barrel file, or a helper that duplicates one in `src/lib/` or `@todoist/cli-core`. Where cli-core has a convention, the CLI follows it.

## Fine

- An exception documented next to the code, with the reason.
- A new broadly reusable helper in `src/lib/`, added to the `CODEBASE.md` catalog.

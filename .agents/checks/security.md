# Check: security

The CLI holds the user's Todoist token and runs on their machine. Apply to changes in `src/` and `scripts/`.

## Report

- A token, `Authorization` header or `TODOIST_API_TOKEN` value written to output, logs (`--verbose` included), errors, `--json` or `--progress-jsonl` events.
- A secret fetched that the command does not display. An opt-in reveal flag must gate the API call, not just the printing.
- Token storage that bypasses `src/lib/auth-store.ts` and the keyring, or a token written to the config file outside the documented offline fallback.
- A mutating SDK method added to `KNOWN_SAFE_API_METHODS` in `src/lib/permissions.ts`, which lets it run under a read-only token.
- A secret passed to an extension beyond the `secretEnvVars` set in `src/commands/extension/index.ts`.
- A shell command built from user or API input as a string, instead of `spawn`/`execFile` with an argument list; a URL from API data opened in the browser without checking it is an http(s) URL.
- OAuth changes (`src/lib/auth-provider.ts`, `src/lib/oauth-scopes.ts`) that widen the scopes a plain `td auth login` asks for.
- `src/postinstall.ts` doing more than refreshing installed skills and migrating auth: it runs on every install.

## Fine

- Logging command names, durations, counts and error codes.
- Test fixtures with fake tokens.

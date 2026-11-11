# Check: privacy and secrets

This repository is public, and the npm package ships `dist/`, `scripts/` and `CHANGELOG.md`.

## Report

- A secret, API key, token or password, even an expired one.
- Real user data in fixtures, tests or docs: real names, emails, task content, Todoist IDs or URLs copied from an account.
- Personal identifiers in docs and examples: real emails, usernames, home-directory paths, local repository names. Use placeholders (`alice@example.com`, `~/code`).
- Internal details: private hostnames, internal URLs, staging servers, Todoist-internal tools or documents.
- A new file under `scripts/` or in package.json `files` that should not be published.
- Untracked files the change doesn't need (`.env`, logs, `.tmp/`).

## Fine

- Made-up fixtures (`fixtures`, `example.com`, "Buy milk") and cli-core's fictional test accounts.
- Public URLs: `todoist.com`, the public API, GitHub, the Help Center.

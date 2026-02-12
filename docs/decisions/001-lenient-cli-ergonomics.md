# 001: Lenient CLI Ergonomics

## Status

Accepted

## Context

The CLI required strict `id:` prefix for all ID arguments (e.g., `id:6QwcgwGW2H73WrVJ`). This created friction for both human users (copy-pasting IDs from other tools) and AI agents (extra formatting step). Additionally, viewing a resource required spelling out the `view` subcommand, and some positional arguments had no named flag alternative, making them harder to use in scripts.

## Decision

Three ergonomic improvements, all backward compatible:

**1. Lenient ID handling.** Accept raw IDs without `id:` prefix everywhere. `lenientIdRef()` replaces `requireIdRef()`. `resolveRef()` auto-retries raw-ID-looking strings as direct lookups before failing. Detection: `looksLikeRawId()` matches numeric strings or alphanumeric mix (no spaces, not pure alpha).

**2. Implicit view subcommand.** `td project <ref>` defaults to `td project view <ref>` using Commander's `{ isDefault: true }`. Applied to project, task, workspace, comment, notification commands.

**3. Named flag aliases.** Positional context arguments also accept named flags: `--project` (section list), `--task` (reminder list/add), `--workspace` (workspace projects/users). Error if both positional and flag are provided.

## Consequences

- `id:` prefix still works everywhere (backward compatible)
- Subcommand names take priority over implicit view: a project named "list" requires `td project view list`
- Skill content documents only canonical forms (explicit subcommands, `id:xxx`) to avoid encouraging collision-prone patterns
- AGENTS.md documents the full picture including implicit behavior

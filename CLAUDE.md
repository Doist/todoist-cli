# Todoist CLI

TypeScript CLI for Todoist. Binary name: `td`.

## Build & Run

```bash
npm run build      # compile TypeScript
npm run dev        # watch mode
npm run lint       # type check only
node dist/index.js # or just `td` if linked
```

## Architecture

```
src/
  index.ts              # entry point, registers all commands
  commands/             # one file per command group
    add.ts              # td add (quick add)
    today.ts            # td today
    inbox.ts            # td inbox
    task.ts             # td task <action>
    project.ts          # td project <action>
    label.ts            # td label <action>
    comment.ts          # td comment <action>
    section.ts          # td section <action>
  lib/
    api.ts              # API client wrapper, type exports
    auth.ts             # token loading (env var or config file)
    output.ts           # formatting utilities
    refs.ts             # id: prefix parsing utilities
    task-list.ts        # shared task listing logic
```

## Key Patterns

- **ID references**: All explicit IDs use `id:` prefix. Use `requireIdRef()` for ID-only args, `isIdRef()`/`extractId()` for mixed refs (fuzzy name + explicit ID)
- **API responses**: Client returns `{ results: T[], nextCursor? }` - always destructure
- **Priority mapping**: API uses 4=p1 (highest), 1=p4 (lowest)
- **Command registration**: Each command exports `registerXxxCommand(program: Command)` function

## Auth

Token from `TODOIST_API_TOKEN` env var or `~/.config/todoist-cli/config.json`:
```json
{ "token": "your-api-token" }
```

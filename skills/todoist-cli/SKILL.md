---
name: todoist-cli
description: "Manage Todoist tasks, projects, labels, comments, and more via the td CLI"
---

# Todoist CLI (td)

Use this skill when the user wants to interact with their Todoist tasks.

## Quick Reference

- `td today` - Tasks due today and overdue
- `td inbox` - Inbox tasks
- `td upcoming` - Tasks due in next N days
- `td completed` - Recently completed tasks
- `td auth login` - Authenticate and store the token securely
- `td task add "content"` - Add a task
- `td task list` - List tasks with filters
- `td task complete <ref>` - Complete a task
- `td project list` - List projects
- `td label list` - List labels
- `td filter list/view` - Manage and use saved filters
- `td workspace list` - List workspaces
- `td activity` - Activity logs
- `td notification list` - Notifications
- `td reminder add` - Task reminders
- `td auth status` - Authentication status
- `td stats` - Productivity stats
- `td settings view` - User settings
- `td completion install` - Install shell completions
- `td attachment view <url>` - View/download a file attachment
- `td view <url>` - View supported Todoist entities/pages by URL
- `td update` - Self-update the CLI to the latest version
- `td changelog` - Show recent changelog entries

## Output Formats

All list commands support:
- `--json` - JSON output (essential fields)
- `--ndjson` - Newline-delimited JSON (streaming)
- `--full` - Include all fields in JSON
- `--raw` - Disable markdown rendering

The following mutating commands also support `--json` to return the created or updated entity as machine-readable JSON instead of plain-text confirmation:
- `task add`, `task update`
- `project create`, `project update`
- `label create`, `label update`
- `comment add`, `comment update`
- `section create`, `section update`
- `filter create`
- `reminder add`

All mutating commands support `--dry-run` to preview what would happen without executing:
- Shows a preview of the action and parameters
- The mutating action is skipped; read-only API calls may still be made to resolve references
- On destructive commands (delete, project move) that use `--yes`, `--dry-run` takes precedence: even with `--yes`, the action will not execute

## Shared List Options

Most list commands also support:
- `--limit <n>` - Limit number of results
- `--all` - Fetch all results (no limit, not available on `activity`)
- `--cursor <cursor>` - Continue from pagination cursor
- `--show-urls` - Show web app URLs for each item

## Global Options

- `--no-spinner` - Disable loading animations
- `--progress-jsonl` - Machine-readable progress events (JSONL to stderr)
- `-v, --verbose` - Verbose output to stderr (repeat: -v info, -vv detail, -vvv debug, -vvvv trace)
- `--accessible` - Add text labels to color-coded output (due:/deadline:/~ prefixes, ★ for favorites). Also: `TD_ACCESSIBLE=1`

## Authentication

```bash
td auth login                          # OAuth login; stores token in OS credential manager
td auth token "your-token"            # Save a manual API token
td auth status                         # Check whether auth works
td auth logout                         # Remove the saved token
export TODOIST_API_TOKEN="your-token"  # Highest priority; overrides stored token
```

If OS credential storage is unavailable, `td` warns and falls back to `~/.config/todoist-cli/config.json`. Legacy plaintext config tokens are migrated automatically when secure storage becomes available.

## References

Tasks, projects, labels, and filters can be referenced by:
- Name (fuzzy matched within context)
- `id:xxx` - Explicit ID
- Todoist URL - Paste directly from the web app (e.g., `https://app.todoist.com/app/task/buy-milk-8Jx4mVr72kPn3QwB` or `https://app.todoist.com/app/project/work-2pN7vKx49mRq6YhT`)

## Priority Mapping

- p1 = Highest priority (API value 4)
- p2 = High priority (API value 3)
- p3 = Medium priority (API value 2)
- p4 = Lowest priority (API value 1, default)

## Commands

### Today
```bash
td today                             # Due today + overdue
td today --json                      # JSON output
td today --workspace "Work"          # Filter to workspace
td today --personal                  # Personal projects only
td today --any-assignee              # Include tasks assigned to others
```

### Inbox
```bash
td inbox                             # Inbox tasks
td inbox --priority p1               # Filter by priority
td inbox --due today                 # Filter by due date
```

### Upcoming
```bash
td upcoming                          # Next 7 days
td upcoming 14                       # Next 14 days
td upcoming --workspace "Work"       # Filter to workspace
td upcoming --personal               # Personal projects only
td upcoming --any-assignee           # Include tasks assigned to others
```

### Completed
```bash
td completed                         # Completed today
td completed --since 2024-01-01 --until 2024-01-31
td completed --project "Work"        # Filter by project
```

### Task Management
```bash
# List with filters
td task list --project "Work"
td task list --label "urgent" --priority p1
td task list --due today
td task list --filter "today | overdue"
td task list --assignee me
td task list --assignee "john@example.com"
td task list --unassigned
td task list --workspace "Work"
td task list --personal
td task list --parent "Parent task"

# View, complete, uncomplete
td task view "task name"
td task complete "task name"
td task complete id:123456
td task complete "task name" --forever  # Stop recurrence
td task uncomplete id:123456            # Reopen completed task

# Add tasks
td task add "New task" --due "tomorrow" --priority p2
td task add "Task" --deadline "2024-03-01" --project "Work"
td task add "Task" --duration 1h --section "Planning" --project "Work"
td task add "Task" --labels "urgent,review" --parent "Parent task"
td task add "Task" --description "Details here" --assignee me
td task add "My task" --stdin < description.md   # Read description from file
cat notes.md | td task add "My task" --stdin
td task add "Reference header" --uncompletable  # Non-actionable reference/header task
td task add "Reference header" --order 0       # Pin task to top of project
td task add "New task" --json                  # Return created task as JSON

# Update
td task update "task name" --due "next week"
td task update "task name" --deadline "2024-06-01"
td task update "task name" --no-deadline
td task update "task name" --duration 2h
td task update "task name" --assignee "john@example.com"
td task update "task name" --unassign
td task update "task name" --stdin < description.md   # Read description from file
td task update "task name" --uncompletable   # Mark as non-completable reference item
td task update "task name" --completable     # Revert to completable (undo --uncompletable)
td task update "Reference header" --order 0   # Move task to top of project
td task update "task name" --content "New" --json  # Return updated task as JSON

# Reschedule (preserves recurrence patterns, unlike update --due)
td task reschedule "task name" 2026-03-20              # Date only (YYYY-MM-DD)
td task reschedule id:123456 2026-03-20T14:00:00       # With time
td task reschedule "task name" 2026-03-20 --json       # Return as JSON

# Move
td task move "task name" --project "Personal"
td task move "task name" --section "In Progress"
td task move "task name" --parent "Parent task"
td task move "task name" --no-parent          # Move to project root
td task move "task name" --no-section         # Remove from section

# Dry run (preview any mutating command without executing)
td task add "New task" --due "tomorrow" --dry-run  # Preview task creation
td task delete "task name" --dry-run               # Preview deletion

# Delete and browse
td task delete "task name" --yes
td task browse "task name"                    # Open in browser
```

### Projects
```bash
td project list
td project list --personal                    # Personal projects only
td project view "Project Name"
td project collaborators "Project Name"
td project create --name "New Project" --color "blue"
td project create --name "New Project" --json    # Return created project as JSON
td project update "Project Name" --favorite
td project update "Project Name" --name "New Name" --json  # Return updated project as JSON
td project archive "Project Name"
td project unarchive "Project Name"
td project delete "Project Name" --yes
td project browse "Project Name"              # Open in browser
td project move "Project Name" --to-workspace "Acme"
td project move "Project Name" --to-workspace "Acme" --folder "Engineering"
td project move "Project Name" --to-workspace "Acme" --visibility team
td project move "Project Name" --to-personal
# move requires --yes to confirm (without it, shows a dry-run preview)
td project create --name "New Project" --dry-run  # Preview project creation
td project delete "Project Name" --dry-run        # Preview deletion
```

### Labels
```bash
td label list                                 # Lists personal + shared labels
td label view "urgent"                        # View label details and tasks
td label view "team-review"                   # Works for shared labels too
td label create --name "urgent" --color "red"
td label create --name "urgent" --json          # Return created label as JSON
td label update "urgent" --color "orange"
td label update "urgent" --color "orange" --json  # Return updated label as JSON
td label delete "urgent" --yes
td label create --name "urgent" --dry-run        # Preview label creation
td label browse "urgent"                      # Open in browser
```

Note: Shared labels (from collaborative projects) appear in `list` and can be viewed, but cannot be deleted/updated via the standard label commands since they have no ID.

### Comments
```bash
td comment list "task name"
td comment list "Project Name" -P             # Project comments
td comment add "task name" --content "Comment text"
td comment add "task name" --content "Note" --json     # Return created comment as JSON
td comment add "task name" --stdin < note.md           # Read content from file
cat note.md | td comment add "task name" --stdin
td comment add "task name" --content "See attached" --file ./report.pdf
td comment view id:123                        # View full comment
td comment update id:123 --content "Updated text"
td comment update id:123 --content "Updated text" --json  # Return updated comment as JSON
td comment delete id:123 --yes
td comment add "task name" --content "Note" --dry-run  # Preview comment creation
td comment browse id:123                      # Open in browser
```

### Attachments
```bash
td attachment view "https://files.todoist.com/..."       # Fetch and display attachment content
td attachment view "https://files.todoist.com/..." --json # JSON output with metadata + content
```

Text files are output directly to stdout. Images and binary files are output as base64.
With `--json`, returns: `fileName`, `fileSize`, `contentType`, `contentCategory`, `encoding` (`utf-8` or `base64`), `content`.
The file URL comes from a comment's `fileAttachment.fileUrl` field (visible in `td comment list --json` output).
10MB file size limit.

### Sections
```bash
td section list "Work"                        # List sections in project (or --project "Work")
td section list --project "Work"              # Same, using named flag
td section create --project "Work" --name "In Progress"
td section create --project "Work" --name "In Progress" --json  # Return created section as JSON
td section update id:123 --name "Done"
td section update id:123 --name "Done" --json  # Return updated section as JSON
td section delete id:123 --yes
td section create --project "Work" --name "In Progress" --dry-run  # Preview section creation
td section browse id:123                      # Open in browser
```

### Filters
```bash
td filter list
td filter create --name "Urgent work" --query "p1 & #Work"
td filter create --name "Urgent work" --query "p1 & #Work" --json  # Return created filter as JSON
td filter view "Urgent work"                  # Show tasks matching filter (alias: show)
td filter update "Urgent work" --query "p1 & #Work & today"
td filter delete "Urgent work" --yes
td filter create --name "Urgent work" --query "p1 & #Work" --dry-run  # Preview filter creation
td filter browse "Urgent work"                # Open in browser
```

### Workspaces
```bash
td workspace list
td workspace view "Workspace Name"
td workspace projects "Workspace Name"        # or --workspace "Workspace Name"
td workspace users "Workspace Name" --role ADMIN,MEMBER  # or --workspace "..."
```

### Activity
```bash
td activity                                   # Recent activity
td activity --since 2024-01-01 --until 2024-01-31
td activity --type task --event completed
td activity --project "Work"
td activity --by me
td activity --markdown                        # LLM-friendly Markdown output
```

### Notifications
```bash
td notification list
td notification list --unread
td notification list --type "item_assign"
td notification view id:123
td notification read --all --yes              # Mark all as read
td notification accept id:123                 # Accept share invitation
td notification reject id:123                 # Reject share invitation
```

### Reminders
```bash
td reminder list "task name"                  # or --task "task name"
td reminder add "task name" --before 30m      # or --task "task name" --before 30m
td reminder add "task name" --before 30m --json  # Return created reminder as JSON
td reminder add "task name" --at "2024-01-15 10:00"
td reminder update id:123 --before 1h
td reminder add "task name" --before 30m --dry-run  # Preview reminder creation
td reminder delete id:123 --yes
```

### Auth
```bash
td auth status                                # Check authentication
td auth status --json                         # JSON: { id, email, fullName }
td auth login                                 # OAuth login
td auth token <token>                         # Save API token
td auth logout                                # Remove saved token
```

### Stats
```bash
td stats                                      # View karma and productivity
td stats --json
td stats goals --daily 10 --weekly 50
td stats vacation --on                        # Enable vacation mode
td stats vacation --off                       # Disable vacation mode
```

### Settings
```bash
td settings view
td settings view --json
td settings update --timezone "America/New_York"
td settings update --time-format 24 --date-format intl
td settings themes                            # List available themes
```

### Shell Completions
```bash
td completion install                         # Install tab completions (prompts for shell)
td completion install bash                    # Install for specific shell
td completion install zsh
td completion install fish
td completion uninstall                       # Remove completions
```

### View (URL Router)
```bash
td view <todoist-url>                          # Auto-route to appropriate view by URL type
td view https://app.todoist.com/app/task/buy-milk-abc123
td view https://app.todoist.com/app/project/work-def456
td view https://app.todoist.com/app/label/urgent-ghi789
td view https://app.todoist.com/app/filter/work-tasks-jkl012
td view https://app.todoist.com/app/today
td view https://app.todoist.com/app/upcoming
td view <url> --json                           # JSON output for entity views
td view <url> --limit 25 --ndjson              # Passthrough list options where supported
```

### Update
```bash
td update                                    # Update CLI to latest version
td update --check                            # Check for updates without installing
```

### Changelog
```bash
td changelog                                 # Show last 5 versions
td changelog -n 3                            # Show last 3 versions
td changelog --count 10                      # Show last 10 versions
```

## Examples

### Daily workflow
```bash
td today --json | jq '.results | length'      # Count today's tasks
td inbox --limit 5                             # Quick inbox check
td upcoming                                    # What's coming this week
td completed                                   # What I finished today
```

### Filter by multiple criteria
```bash
td task list --project "Work" --label "urgent" --priority p1
td task list --filter "today & #Work"
td task list --workspace "Work" --due today
```

### Complete tasks efficiently
```bash
td task complete "Review PR"
td task complete id:123456789
td task uncomplete id:123456789                # Reopen if needed
```

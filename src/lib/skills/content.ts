export const SKILL_NAME = 'todoist'
export const SKILL_DESCRIPTION =
    'Manage Todoist tasks, projects, labels, comments, and more via the td CLI'

export const SKILL_CONTENT = `# Todoist CLI (td)

Use this skill when the user wants to interact with their Todoist tasks.

## Quick Reference

- \`td today\` - Tasks due today and overdue
- \`td inbox\` - Inbox tasks
- \`td upcoming\` - Tasks due in next N days
- \`td completed\` - Recently completed tasks
- \`td task add "content"\` - Add a task
- \`td task list\` - List tasks with filters
- \`td task complete <ref>\` - Complete a task
- \`td project list\` - List projects
- \`td label list\` - List labels
- \`td filter list/show\` - Manage and use saved filters
- \`td workspace list\` - List workspaces
- \`td activity\` - Activity logs
- \`td notification list\` - Notifications
- \`td reminder add\` - Task reminders
- \`td stats\` - Productivity stats
- \`td settings view\` - User settings

## Output Formats

All list commands support:
- \`--json\` - JSON output (essential fields)
- \`--ndjson\` - Newline-delimited JSON (streaming)
- \`--full\` - Include all fields in JSON
- \`--raw\` - Disable markdown rendering

## Shared List Options

Most list commands also support:
- \`--limit <n>\` - Limit number of results
- \`--all\` - Fetch all results (no limit)
- \`--cursor <cursor>\` - Continue from pagination cursor
- \`--show-urls\` - Show web app URLs for each item

## Global Options

- \`--no-spinner\` - Disable loading animations
- \`--progress-jsonl\` - Machine-readable progress events (JSONL to stderr)
- \`-v, --verbose\` - Verbose output to stderr (repeat: -v info, -vv detail, -vvv debug, -vvvv trace)

## Task References

Tasks can be referenced by:
- Name (fuzzy matched within context)
- \`id:xxx\` - Explicit task ID

## Priority Mapping

- p1 = Highest priority (API value 4)
- p2 = High priority (API value 3)
- p3 = Medium priority (API value 2)
- p4 = Lowest priority (API value 1, default)

## Commands

### Today
\`\`\`bash
td today                             # Due today + overdue
td today --json                      # JSON output
td today --workspace "Work"          # Filter to workspace
td today --personal                  # Personal projects only
td today --any-assignee              # Include tasks assigned to others
\`\`\`

### Inbox
\`\`\`bash
td inbox                             # Inbox tasks
td inbox --priority p1               # Filter by priority
td inbox --due today                 # Filter by due date
\`\`\`

### Upcoming
\`\`\`bash
td upcoming                          # Next 7 days
td upcoming 14                       # Next 14 days
td upcoming --workspace "Work"       # Filter to workspace
td upcoming --personal               # Personal projects only
td upcoming --any-assignee           # Include tasks assigned to others
\`\`\`

### Completed
\`\`\`bash
td completed                         # Completed today
td completed --since 2024-01-01 --until 2024-01-31
td completed --project "Work"        # Filter by project
\`\`\`

### Task Management
\`\`\`bash
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

# Update
td task update "task name" --due "next week"
td task update "task name" --deadline "2024-06-01"
td task update "task name" --no-deadline
td task update "task name" --duration 2h
td task update "task name" --assignee "john@example.com"
td task update "task name" --unassign

# Move
td task move "task name" --project "Personal"
td task move "task name" --section "In Progress"
td task move "task name" --parent "Parent task"
td task move "task name" --no-parent          # Move to project root
td task move "task name" --no-section         # Remove from section

# Delete and browse
td task delete "task name" --yes
td task browse "task name"                    # Open in browser
\`\`\`

### Projects
\`\`\`bash
td project list
td project list --personal                    # Personal projects only
td project view "Project Name"
td project collaborators "Project Name"
td project create --name "New Project" --color "blue"
td project update "Project Name" --favorite
td project archive "Project Name"
td project unarchive "Project Name"
td project delete "Project Name" --yes
td project browse "Project Name"              # Open in browser
\`\`\`

### Labels
\`\`\`bash
td label list
td label create --name "urgent" --color "red"
td label update "urgent" --color "orange"
td label delete "urgent" --yes
td label browse "urgent"                      # Open in browser
\`\`\`

### Comments
\`\`\`bash
td comment list --task "task name"
td comment list --project "Project Name" -P   # Project comments
td comment add --task "task name" --content "Comment text"
td comment add --task "task name" --content "See attached" --file ./report.pdf
td comment view id:123                        # View full comment
td comment update id:123 --content "Updated text"
td comment delete id:123 --yes
td comment browse id:123                      # Open in browser
\`\`\`

### Sections
\`\`\`bash
td section list "Work"                        # List sections in project (or --project "Work")
td section list --project "Work"              # Same, using named flag
td section create --project "Work" --name "In Progress"
td section update id:123 --name "Done"
td section delete id:123 --yes
td section browse id:123                      # Open in browser
\`\`\`

### Filters
\`\`\`bash
td filter list
td filter create --name "Urgent work" --query "p1 & #Work"
td filter show "Urgent work"                  # Show tasks matching filter
td filter update "Urgent work" --query "p1 & #Work & today"
td filter delete "Urgent work" --yes
td filter browse "Urgent work"                # Open in browser
\`\`\`

### Workspaces
\`\`\`bash
td workspace list
td workspace view "Workspace Name"
td workspace projects "Workspace Name"        # or --workspace "Workspace Name"
td workspace users "Workspace Name" --role ADMIN,MEMBER  # or --workspace "..."
\`\`\`

### Activity
\`\`\`bash
td activity                                   # Recent activity
td activity --since 2024-01-01 --until 2024-01-31
td activity --type task --event completed
td activity --project "Work"
td activity --by me
\`\`\`

### Notifications
\`\`\`bash
td notification list
td notification list --unread
td notification list --type "item_assign"
td notification view id:123
td notification read --all --yes              # Mark all as read
td notification accept id:123                 # Accept share invitation
td notification reject id:123                 # Reject share invitation
\`\`\`

### Reminders
\`\`\`bash
td reminder list "task name"                  # or --task "task name"
td reminder add "task name" --before 30m      # or --task "task name" --before 30m
td reminder add "task name" --at "2024-01-15 10:00"
td reminder update id:123 --before 1h
td reminder delete id:123 --yes
\`\`\`

### Stats
\`\`\`bash
td stats                                      # View karma and productivity
td stats --json
td stats goals --daily 10 --weekly 50
td stats vacation --on                        # Enable vacation mode
td stats vacation --off                       # Disable vacation mode
\`\`\`

### Settings
\`\`\`bash
td settings view
td settings view --json
td settings update --timezone "America/New_York"
td settings update --time-format 24 --date-format intl
td settings themes                            # List available themes
\`\`\`

## Examples

### Daily workflow
\`\`\`bash
td today --json | jq '.results | length'      # Count today's tasks
td inbox --limit 5                             # Quick inbox check
td upcoming                                    # What's coming this week
td completed                                   # What I finished today
\`\`\`

### Filter by multiple criteria
\`\`\`bash
td task list --project "Work" --label "urgent" --priority p1
td task list --filter "today & #Work"
td task list --workspace "Work" --due today
\`\`\`

### Complete tasks efficiently
\`\`\`bash
td task complete "Review PR"
td task complete id:123456789
td task uncomplete id:123456789                # Reopen if needed
\`\`\`
`

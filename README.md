# Todoist CLI

A command-line interface for Todoist.

## Installation

> **Note**: This package is not yet published to npm.

```bash
# Once published:
npm install -g @doist/todoist-cli

# For now, clone and link locally:
git clone <repo-url>
cd todoist-cli
npm install
npm run build
npm link
```

## Setup

Set your Todoist API token (get it from [Todoist Settings > Integrations > Developer](https://todoist.com/app/settings/integrations/developer)):

```bash
export TODOIST_API_TOKEN="your-token"
```

Or create `~/.config/todoist-cli/config.json`:
```json
{ "token": "your-token" }
```

## Usage

```bash
td add "Buy milk tomorrow #Shopping"   # quick add with natural language
td today                               # tasks due today + overdue
td inbox                               # inbox tasks
td task list                           # all tasks
td task list --project "Work"          # tasks in project
td project list                        # all projects
```

Run `td --help` or `td <command> --help` for more options.

## Development

```bash
npm install
npm run build    # compile
npm run dev      # watch mode
npm run lint     # type check
```

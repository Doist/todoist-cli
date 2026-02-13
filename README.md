# Todoist CLI

A command-line interface for Todoist.

## Installation

> ```bash
> npm install -g @doist/todoist-cli
> ```

### Local Setup (for now)

```bash
git clone https://github.com/Doist/todoist-cli.git
cd todoist-cli
npm install
npm run build
npm link
```

This makes the `td` command available globally.

## Setup

```bash
td auth login
```

This opens your browser to authenticate with Todoist. Once approved, the token is saved automatically.

### Alternative methods

**Manual token:** Get your API token from [Todoist Settings > Integrations > Developer](https://todoist.com/app/settings/integrations/developer):

```bash
td auth token "your-token"
```

**Environment variable:**

```bash
export TODOIST_API_TOKEN="your-token"
```

### Auth commands

```bash
td auth status   # check if authenticated
td auth logout   # remove saved token
```

## Usage

```bash
td add "Buy milk tomorrow #Shopping"   # quick add with natural language
td today                               # tasks due today + overdue
td inbox                               # inbox tasks
td task list                           # all tasks
td task list --project "Work"          # tasks in project
td project list                        # all projects
td task view https://app.todoist.com/app/task/buy-milk-8Jx4mVr72kPn3QwB  # paste a URL
```

Run `td --help` or `td <command> --help` for more options.

## Development

```bash
npm install
npm run build       # compile
npm run dev         # watch mode
npm run type-check  # type check
npm run format      # format code
npm test            # run tests
```

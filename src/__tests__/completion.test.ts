import { Command, Option } from 'commander'
import { describe, expect, it } from 'vitest'
import { roleOption } from '../commands/workspace.js'
import {
    type CompletionItem,
    getCompletions,
    withCaseInsensitiveChoices,
} from '../lib/completion.js'

function createTestProgram(): Command {
    const program = new Command()
    program.name('td')

    // Simulate a few commands similar to the real CLI
    const task = program.command('task').description('Manage tasks')
    task.command('list')
        .description('List tasks')
        .option('--project <name>', 'Filter by project')
        .addOption(
            withCaseInsensitiveChoices(new Option('--priority <p1-p4>', 'Filter by priority'), [
                'p1',
                'p2',
                'p3',
                'p4',
            ]),
        )
        .option('--json', 'Output as JSON')
        .option('--limit <n>', 'Limit results')
        .option('--all', 'Fetch all results')
    task.command('add').description('Add a task').option('--due <date>', 'Due date')
    task.command('view').description('View task details')
    task.command('complete').description('Complete a task')

    program.command('today').description('Tasks due today').option('--json', 'Output as JSON')

    program
        .command('activity')
        .description('View activity logs')
        .addOption(
            withCaseInsensitiveChoices(new Option('--event <type>', 'Filter by event type'), [
                'added',
                'updated',
                'deleted',
                'completed',
                'uncompleted',
                'archived',
                'unarchived',
                'shared',
                'left',
            ]),
        )
        .addOption(
            withCaseInsensitiveChoices(new Option('--type <type>', 'Filter by object type'), [
                'task',
                'comment',
                'project',
            ]),
        )

    const settings = program.command('settings').description('Manage settings')
    settings
        .command('update')
        .description('Update settings')
        .addOption(
            withCaseInsensitiveChoices(new Option('--theme <name>', 'Theme name'), [
                'todoist',
                'dark',
                'moonstone',
                'tangerine',
                'kale',
                'blueberry',
                'lavender',
                'raspberry',
            ]),
        )
        .addOption(
            withCaseInsensitiveChoices(new Option('--time-format <format>', 'Time format'), [
                '12',
                '24',
                '12h',
                '24h',
            ]),
        )
        .addOption(
            withCaseInsensitiveChoices(new Option('--start-day <day>', 'Week start day'), [
                'monday',
                'tuesday',
                'wednesday',
                'thursday',
                'friday',
                'saturday',
                'sunday',
                'mon',
                'tue',
                'wed',
                'thu',
                'fri',
                'sat',
                'sun',
            ]),
        )

    const project = program.command('project').description('Manage projects')
    project
        .command('add')
        .description('Add project')
        .addOption(
            withCaseInsensitiveChoices(new Option('--view-style <style>', 'View style'), [
                'list',
                'board',
            ]),
        )

    // Option with argChoices set directly (no Commander validation) to allow comma-separated values
    const workspace = program.command('workspace').description('Manage workspaces')
    workspace.command('users').description('List users').addOption(roleOption())

    // Hidden command (like completion-server)
    const hidden = program.command('hidden-cmd').description('Internal command')
    ;(hidden as Command & { _hidden: boolean })._hidden = true

    return program
}

function names(items: CompletionItem[]): string[] {
    return items.map((i) => i.name)
}

describe('getCompletions', () => {
    describe('top-level commands', () => {
        it('returns all visible commands when current is empty', () => {
            const program = createTestProgram()
            const result = getCompletions(program, [''], '')
            const commandNames = names(result)
            expect(commandNames).toContain('task')
            expect(commandNames).toContain('today')
            expect(commandNames).toContain('activity')
            expect(commandNames).toContain('settings')
            expect(commandNames).toContain('project')
            expect(commandNames).not.toContain('hidden-cmd')
        })

        it('filters commands by prefix', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['t'], 't')
            const commandNames = names(result)
            expect(commandNames).toContain('task')
            expect(commandNames).toContain('today')
            expect(commandNames).not.toContain('activity')
        })

        it('includes descriptions', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['today'], 'today')
            const todayItem = result.find((i) => i.name === 'today')
            expect(todayItem?.description).toBe('Tasks due today')
        })
    })

    describe('subcommands', () => {
        it('returns subcommands after entering a parent command', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', ''], '')
            const commandNames = names(result)
            expect(commandNames).toContain('list')
            expect(commandNames).toContain('add')
            expect(commandNames).toContain('view')
            expect(commandNames).toContain('complete')
        })

        it('filters subcommands by prefix', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'l'], 'l')
            const commandNames = names(result)
            expect(commandNames).toContain('list')
            expect(commandNames).not.toContain('add')
        })

        it('handles nested subcommands', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['settings', ''], '')
            const commandNames = names(result)
            expect(commandNames).toContain('update')
        })
    })

    describe('options', () => {
        it('returns options when current word starts with -', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--'], '--')
            const optionNames = names(result)
            expect(optionNames).toContain('--project')
            expect(optionNames).toContain('--priority')
            expect(optionNames).toContain('--json')
            expect(optionNames).toContain('--limit')
        })

        it('filters options by prefix', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--pr'], '--pr')
            const optionNames = names(result)
            expect(optionNames).toContain('--project')
            expect(optionNames).toContain('--priority')
            expect(optionNames).not.toContain('--json')
        })

        it('excludes already-used options', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--json', '--'], '--')
            const optionNames = names(result)
            expect(optionNames).not.toContain('--json')
            expect(optionNames).toContain('--project')
        })

        it('returns options for top-level commands', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['today', '--'], '--')
            const optionNames = names(result)
            expect(optionNames).toContain('--json')
        })

        it('suggests options when command has no subcommands', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['activity', ''], '')
            const optionNames = names(result)
            expect(optionNames).toContain('--event')
            expect(optionNames).toContain('--type')
        })
    })

    describe('enum values', () => {
        it('completes priority values', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--priority', ''], '')
            const valueNames = names(result)
            expect(valueNames).toEqual(['p1', 'p2', 'p3', 'p4'])
        })

        it('filters priority values by prefix', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--priority', 'p1'], 'p1')
            expect(names(result)).toEqual(['p1'])
        })

        it('completes event type values', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['activity', '--event', ''], '')
            const valueNames = names(result)
            expect(valueNames).toContain('added')
            expect(valueNames).toContain('completed')
            expect(valueNames).toContain('deleted')
        })

        it('completes theme values', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['settings', 'update', '--theme', ''], '')
            const valueNames = names(result)
            expect(valueNames).toContain('todoist')
            expect(valueNames).toContain('dark')
        })

        it('completes view-style values', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['project', 'add', '--view-style', ''], '')
            expect(names(result)).toEqual(['list', 'board'])
        })

        it('completes time-format values', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['settings', 'update', '--time-format', ''], '')
            expect(names(result)).toEqual(['12', '24', '12h', '24h'])
        })

        it('completes start-day values', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['settings', 'update', '--start-day', ''], '')
            const valueNames = names(result)
            expect(valueNames).toContain('monday')
            expect(valueNames).toContain('sunday')
            expect(valueNames).toContain('mon')
            expect(valueNames).toContain('sun')
            expect(valueNames).toHaveLength(14)
        })

        it('completes argChoices set without .choices() (no Commander validation)', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['workspace', 'users', '--role', ''], '')
            expect(names(result)).toEqual(['ADMIN', 'MEMBER', 'GUEST'])
        })

        it('returns empty for options with no known enum', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--project', ''], '')
            expect(result).toEqual([])
        })
    })

    describe('double dash separator', () => {
        it('stops offering options after --', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--', '--pr'], '--pr')
            // After --, even words starting with -- should not match options
            expect(result).toEqual([])
        })
    })

    describe('--flag=value syntax', () => {
        it('completes values after = for known enums', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['task', 'list', '--priority='], '--priority=')
            const valueNames = names(result)
            expect(valueNames).toEqual([
                '--priority=p1',
                '--priority=p2',
                '--priority=p3',
                '--priority=p4',
            ])
        })

        it('filters values after = by partial input', () => {
            const program = createTestProgram()
            const result = getCompletions(
                program,
                ['task', 'list', '--priority=p1'],
                '--priority=p1',
            )
            expect(names(result)).toEqual(['--priority=p1'])
        })
    })

    describe('option value consumption', () => {
        it('skips value word for options expecting a value', () => {
            const program = createTestProgram()
            // --project consumes <name>, so the next -- should still see all options
            const result = getCompletions(
                program,
                ['task', 'list', '--project', 'MyProject', '--'],
                '--',
            )
            const optionNames = names(result)
            expect(optionNames).toContain('--priority')
            expect(optionNames).not.toContain('--project') // already used
        })

        it('does not skip value for boolean flags', () => {
            const program = createTestProgram()
            // --json is boolean, so 'list' after it is treated as a subcommand word
            const result = getCompletions(program, ['task', '--json', ''], '')
            // --json doesn't consume next word, so the empty string gets subcommand completions for 'task'
            const commandNames = names(result)
            expect(commandNames).toContain('list')
        })
    })

    describe('hidden commands', () => {
        it('excludes hidden commands from results', () => {
            const program = createTestProgram()
            const result = getCompletions(program, [''], '')
            expect(names(result)).not.toContain('hidden-cmd')
        })

        it('excludes completion-server from results', () => {
            const program = createTestProgram()
            program.command('completion-server').description('Internal')
            const result = getCompletions(program, [''], '')
            expect(names(result)).not.toContain('completion-server')
        })
    })

    describe('edge cases', () => {
        it('handles empty words array', () => {
            const program = createTestProgram()
            const result = getCompletions(program, [], '')
            const commandNames = names(result)
            expect(commandNames).toContain('task')
            expect(commandNames).toContain('today')
        })

        it('handles unknown command gracefully', () => {
            const program = createTestProgram()
            const result = getCompletions(program, ['nonexistent', ''], '')
            // Stays at root level since 'nonexistent' doesn't match any command
            const commandNames = names(result)
            expect(commandNames).toContain('task')
        })
    })
})

import { Command } from 'commander'
import { expect, it, vi } from 'vitest'
import { commandSchema } from './command-schema.js'
import { enableMutationJson } from './mutation-json.js'

it('describes nested flags and arguments as JSON-safe help data', () => {
    const program = new Command('td')
    program.command('task').command('complete <ref>').option('--forever', 'Complete forever')

    const schema = commandSchema(program) as {
        commands: { commands: { arguments: { name: string }[]; options: { flags: string }[] }[] }[]
    }
    expect(schema.commands[0].commands[0].arguments[0].name).toBe('ref')
    expect(schema.commands[0].commands[0].options[0].flags).toBe('--forever')
    expect(() => JSON.stringify(schema)).not.toThrow()
})

it('makes an existing entity mutation return a single JSON success envelope', async () => {
    const program = new Command('td')
    const write = vi.fn(() => console.log('Completed: Example (id:task-1)'))
    program.command('task').command('complete <ref>').action(write)
    enableMutationJson(program)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})

    await program.parseAsync(['node', 'td', 'task', 'complete', 'task-1', '--json'])

    expect(write).toHaveBeenCalledOnce()
    expect(output).toHaveBeenCalledOnce()
    expect(JSON.parse(String(output.mock.calls[0][0]))).toEqual({
        ok: true,
        command: 'td task complete',
        messages: ['Completed: Example (id:task-1)'],
    })
})

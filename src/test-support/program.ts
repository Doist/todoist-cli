import { Command } from 'commander'

export function createTestProgram(register: (program: Command) => void): Command {
    const program = new Command()
    program.exitOverride()
    register(program)
    return program
}

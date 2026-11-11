import { createTestProgram } from '@todoist/cli-core/testing'
import { registerProjectCommand } from '../commands/project/index.js'

/** Builds a test program with the `project` command tree registered. */
export function createProjectProgram() {
    return createTestProgram(registerProjectCommand)
}

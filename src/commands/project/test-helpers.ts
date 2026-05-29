import { createTestProgram } from '@doist/cli-core/testing'
import { registerProjectCommand } from './index.js'

/** Builds a test program with the `project` command tree registered. */
export function createProjectProgram() {
    return createTestProgram(registerProjectCommand)
}

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerChangelogCommand as registerCoreChangelogCommand } from '@doist/cli-core/commands'
import type { Command } from 'commander'
import packageJson from '../../package.json' with { type: 'json' }

const CHANGELOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CHANGELOG.md')

export function registerChangelogCommand(program: Command): void {
    registerCoreChangelogCommand(program, {
        path: CHANGELOG_PATH,
        repoUrl: 'https://github.com/Doist/todoist-cli',
        version: packageJson.version,
    })
}

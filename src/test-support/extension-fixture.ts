/**
 * Builds real extensions on disk for tests.
 *
 * The extension contract is the process boundary, so the only way to test it
 * honestly is to install and run an actual executable. These helpers write the
 * smallest thing that can prove the contract: a script that reports the
 * arguments and environment it was given, and exits with a code the test picks.
 */

import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type FixtureOptions = {
    /** Host binary name the extension belongs to. Defaults to `td`. */
    binName?: string
    /** Interpreter for the fixture. `node` exercises the shebang shortcut. */
    interpreter?: 'node' | 'sh'
    /** Contents of `<bin>-extension.json`, written only when given. */
    authoredManifest?: Record<string, unknown>
    /** Contents of `.<bin>-manifest.json`, which marks a binary install. */
    installedManifest?: Record<string, unknown>
    /** Leave the executable bit off, as an unbuilt compiled extension would. */
    notExecutable?: boolean
    /** Extra files to write into the extension directory. */
    files?: Record<string, string>
}

/**
 * A fixture that prints one JSON object to stdout describing how it was
 * called, so a test can assert on argument passthrough and the environment
 * contract in one go. It reports to the file named by `XX_REPORT` when that is
 * set, and to stdout otherwise. `--exit-code N` makes it exit with N, and
 * `--fail` writes to stderr.
 */
const NODE_FIXTURE = `#!/usr/bin/env node
const args = process.argv.slice(2)
const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith('TD_') || key.startsWith('XX_')),
)
const report = JSON.stringify({ args, env, cwd: process.cwd() })
const exitFlag = args.indexOf('--exit-code')
const code = exitFlag === -1 ? 0 : Number(args[exitFlag + 1])
if (args.includes('--fail')) process.stderr.write('fixture failed')
// Dynamic import works whether node loads this as CommonJS or ESM, which
// depends on whatever package.json happens to sit above the fixture.
if (process.env.XX_REPORT) {
    import('node:fs').then((fs) => {
        fs.writeFileSync(process.env.XX_REPORT, report)
        process.exit(code)
    })
} else {
    process.stdout.write(report)
    process.exit(code)
}
`

const SH_FIXTURE = `#!/bin/sh
echo "args:$*"
echo "name:$TD_EXTENSION_NAME"
exit 0
`

/**
 * Write an extension directory named `<binName>-<name>` under `parentDir` and
 * return its path.
 */
export async function writeFixtureExtension(
    parentDir: string,
    name: string,
    options: FixtureOptions = {},
): Promise<string> {
    const binName = options.binName ?? 'td'
    const dirName = `${binName}-${name}`
    const dir = join(parentDir, dirName)
    await mkdir(dir, { recursive: true })

    const executablePath = join(dir, dirName)
    const body = options.interpreter === 'sh' ? SH_FIXTURE : NODE_FIXTURE
    await writeFile(executablePath, body)
    if (!options.notExecutable) await chmod(executablePath, 0o755)

    if (options.authoredManifest) {
        await writeFile(
            join(dir, `${binName}-extension.json`),
            JSON.stringify(options.authoredManifest, null, 2),
        )
    }
    if (options.installedManifest) {
        await writeFile(
            join(dir, `.${binName}-manifest.json`),
            JSON.stringify(options.installedManifest, null, 2),
        )
    }
    for (const [file, contents] of Object.entries(options.files ?? {})) {
        await writeFile(join(dir, file), contents)
    }

    return dir
}

/** Make a directory look like a git clone without running git. */
export async function writeFakeGitRepo(dir: string, remoteUrl: string): Promise<void> {
    await mkdir(join(dir, '.git'), { recursive: true })
    await writeFile(
        join(dir, '.git', 'config'),
        `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${remoteUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
    )
}

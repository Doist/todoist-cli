import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installDependencies } from './npm.js'

/**
 * These tests put a fake `npm` on PATH and inspect how it was called, which is
 * the only way to prove what the real one would receive. Windows resolves and
 * invokes npm differently, so the fake would not stand in for it.
 */
describe.skipIf(process.platform === 'win32')('installDependencies', () => {
    let root: string
    let extensionDir: string
    let recordPath: string

    async function fakeNpmOnPath(exitCode = 0): Promise<void> {
        const binDir = join(root, 'bin')
        await writeFile(
            join(binDir, 'npm'),
            `#!/bin/sh\n{ echo "ARGS:$*"; env; } > "${recordPath}"\nexit ${exitCode}\n`,
        )
        await chmod(join(binDir, 'npm'), 0o755)
        vi.stubEnv('PATH', binDir)
    }

    async function record(): Promise<string> {
        return readFile(recordPath, 'utf8')
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-npm-'))
        extensionDir = join(root, 'td-goals')
        recordPath = join(root, 'npm-call.txt')
        await mkdir(join(root, 'bin'), { recursive: true })
        await mkdir(extensionDir, { recursive: true })
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        await rm(root, { recursive: true, force: true })
    })

    it('does nothing when the extension has no package.json', async () => {
        await fakeNpmOnPath()

        await installDependencies(extensionDir)

        await expect(record()).rejects.toThrow()
    })

    it('uses npm ci when a lockfile is present', async () => {
        await writeFile(join(extensionDir, 'package.json'), '{}')
        await writeFile(join(extensionDir, 'package-lock.json'), '{}')
        await fakeNpmOnPath()

        await installDependencies(extensionDir)

        expect(await record()).toContain('ARGS:ci --omit=dev')
    })

    it('avoids writing a lockfile into a clone that has none', async () => {
        await writeFile(join(extensionDir, 'package.json'), '{}')
        await fakeNpmOnPath()

        await installDependencies(extensionDir)

        // Writing one would leave the clone looking modified, which later makes
        // `remove` refuse on an extension the user never touched.
        expect(await record()).toContain('ARGS:install --omit=dev --no-package-lock')
    })

    it('keeps the CLI’s own credentials away from lifecycle scripts', async () => {
        vi.stubEnv('TODOIST_API_TOKEN', 'secret-todoist-token')
        vi.stubEnv('GH_TOKEN', 'secret-github-token')
        vi.stubEnv('GITHUB_TOKEN', 'secret-github-token')
        await writeFile(join(extensionDir, 'package.json'), '{}')
        await fakeNpmOnPath()

        await installDependencies(extensionDir)

        const environment = await record()
        expect(environment).not.toContain('secret-todoist-token')
        expect(environment).not.toContain('secret-github-token')
    })

    it('reports a missing npm as its own failure', async () => {
        await writeFile(join(extensionDir, 'package.json'), '{}')
        vi.stubEnv('PATH', join(root, 'empty'))

        await expect(installDependencies(extensionDir)).rejects.toMatchObject({
            code: 'EXTENSION_NPM_MISSING',
        })
    })

    it('surfaces an npm failure with its output as hints', async () => {
        await writeFile(join(extensionDir, 'package.json'), '{}')
        await fakeNpmOnPath(1)

        await expect(installDependencies(extensionDir)).rejects.toMatchObject({
            code: 'EXTENSION_INSTALL_FAILED',
        })
    })
})

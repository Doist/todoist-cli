import { chmod, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureConsole } from '@doist/cli-core/testing'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { checkExtensions } from './doctor.js'

const REAL_PLATFORM = process.platform

describe('checkExtensions', () => {
    let root: string
    let extensionsDir: string

    /** A program shaped like td's, so shadowing is measured against real names. */
    function program(): Command {
        const command = new Command()
        command.command('task')
        return command
    }

    function messages(checks: { message: string }[]): string {
        return checks.map((check) => check.message).join('\n')
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-doctor-'))
        extensionsDir = join(root, 'data', 'todoist-cli', 'extensions')
        await mkdir(extensionsDir, { recursive: true })
        vi.stubEnv('XDG_DATA_HOME', join(root, 'data'))
        vi.stubEnv('XDG_STATE_HOME', join(root, 'state'))
        captureConsole('log')
    })

    afterEach(async () => {
        Object.defineProperty(process, 'platform', {
            value: REAL_PLATFORM,
            configurable: true,
        })
        vi.unstubAllEnvs()
        await rm(root, { recursive: true, force: true })
    })

    it('reports nothing when no extension is installed', async () => {
        expect(await checkExtensions(program())).toEqual([])
    })

    it('reports a healthy extension with one line and no warnings', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {})
        const checks = await checkExtensions(program())

        expect(checks).toHaveLength(1)
        expect(checks[0]).toMatchObject({ name: 'extensions', status: 'pass' })
        expect(checks[0].message).toContain('1 extension(s) installed')
    })

    // Root reads a 0o000 directory regardless, so there is nothing to observe.
    it.skipIf(process.getuid?.() === 0)(
        'reports a directory it cannot read rather than saying nothing is installed',
        async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            await chmod(extensionsDir, 0o000)

            try {
                const checks = await checkExtensions(program())
                expect(checks).toHaveLength(1)
                expect(checks[0]).toMatchObject({ status: 'fail' })
                expect(checks[0].message).toContain('Cannot read')
            } finally {
                await chmod(extensionsDir, 0o755)
            }
        },
    )

    it('warns about a manifest that is not a regular file', async () => {
        const dir = await writeFixtureExtension(extensionsDir, 'goals', {})
        // An extension chooses what sits in its own directory, and reading a
        // FIFO or a device would never finish.
        await symlink('/dev/zero', join(dir, 'td-extension.json'))

        expect(messages(await checkExtensions(program()))).toContain('not a regular file')
    })

    it('fails an extension that cannot be run', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', { notExecutable: true })
        const checks = await checkExtensions(program())

        expect(checks.some((check) => check.status === 'fail')).toBe(true)
        expect(messages(checks)).toContain('is missing or not executable')
    })

    it('warns about an extension a built-in command hides, and how to run it', async () => {
        await writeFixtureExtension(extensionsDir, 'task', {})
        const checks = await checkExtensions(program())

        const shadowed = checks.find((check) => check.message.includes('hidden by the built-in'))
        expect(shadowed?.status).toBe('warn')
        expect(shadowed?.message).toContain('td extension exec task')
    })

    it('warns about a manifest it cannot read', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            files: { 'td-extension.json': '{ not json' },
        })
        const checks = await checkExtensions(program())

        expect(messages(checks)).toContain('td-extension.json could not be read')
        expect(messages(checks)).toContain('Fix or delete the file')
    })

    it('warns when the running td is older than the extension asks for', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            authoredManifest: { requires: { td: '>=99.0.0' } },
        })
        const checks = await checkExtensions(program())

        const incompatible = checks.find((check) => check.message.includes('expects td >=99.0.0'))
        expect(incompatible?.status).toBe('warn')
        expect(incompatible?.message).toContain('td update')
    })

    it('says nothing about a requirement the running td satisfies', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            authoredManifest: { requires: { td: '>=1.0.0' } },
        })
        expect(await checkExtensions(program())).toHaveLength(1)
    })

    it('warns about a manifest from a newer format', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            authoredManifest: { manifestVersion: 99 },
        })
        expect(messages(await checkExtensions(program()))).toContain(
            'manifest format newer than this td understands',
        )
    })

    it('says extensions are experimental on Windows', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
        await writeFixtureExtension(extensionsDir, 'goals', {})

        expect(messages(await checkExtensions(program()))).toContain('experimental on Windows')
    })

    it('reports one extension problem per check rather than one per extension', async () => {
        await writeFixtureExtension(extensionsDir, 'task', { notExecutable: true })
        const checks = await checkExtensions(program())

        // Summary, plus the two separate things wrong with this one extension.
        expect(checks).toHaveLength(3)
        expect(checks.map((check) => check.status)).toEqual(['pass', 'fail', 'warn'])
    })
})

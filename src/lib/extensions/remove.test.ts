import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { discoverExtensions } from './discover.js'
import { removeExtension } from './remove.js'
import { run } from './run.js'
import { readState, stateFilePath, writeState } from './state.js'

const OFFICIAL = { host: 'github.com', owner: 'Doist' }

describe('removeExtension', () => {
    let root: string
    let extensionsDir: string
    let stateDir: string

    const context = () => ({ binName: 'td', stateDir })
    const find = async (name: string) => {
        const found = await discoverExtensions({
            extensionsDir,
            stateDir,
            binName: 'td',
            officialSource: OFFICIAL,
        })
        const extension = found.find((candidate) => candidate.name === name)
        if (!extension) throw new Error(`fixture ${name} not discovered`)
        return extension
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-remove-'))
        extensionsDir = join(root, 'extensions')
        stateDir = join(root, 'state')
        await mkdir(extensionsDir, { recursive: true })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('removes a binary install and its state file', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: {
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v1',
                pinned: false,
                asset: 'a',
                installedAt: 'now',
            },
        })
        await writeState(stateDir, 'td-goals', { latestRelease: 'v1' })

        const result = await removeExtension(await find('goals'), {}, context())

        expect(result).toMatchObject({ name: 'goals', kind: 'binary', removed: 'directory' })
        await expect(stat(join(extensionsDir, 'td-goals'))).rejects.toThrow()
        await expect(stat(stateFilePath(stateDir, 'td-goals'))).rejects.toThrow()
    })

    it('removes only the link for a local install, never the user’s directory', async () => {
        const workspace = join(root, 'code')
        await mkdir(workspace, { recursive: true })
        const target = await writeFixtureExtension(workspace, 'scratch')
        await symlink(target, join(extensionsDir, 'td-scratch'), 'dir')

        const result = await removeExtension(await find('scratch'), {}, context())

        expect(result).toMatchObject({ kind: 'local', removed: 'link' })
        await expect(stat(join(extensionsDir, 'td-scratch'))).rejects.toThrow()
        await expect(stat(join(target, 'td-scratch'))).resolves.toBeTruthy()
    })

    describe('git clones', () => {
        let hasGit = false

        async function makeClone(name: string, dirty: boolean): Promise<void> {
            const dir = await writeFixtureExtension(extensionsDir, name)
            await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir })
            await run('git', ['add', '.'], { cwd: dir })
            await run(
                'git',
                [
                    '-c',
                    'user.email=t@example.com',
                    '-c',
                    'user.name=T',
                    'commit',
                    '--quiet',
                    '-m',
                    'init',
                ],
                { cwd: dir },
            )
            if (dirty) await writeFile(join(dir, 'notes.md'), 'work in progress')
        }

        beforeEach(async () => {
            hasGit = (await run('git', ['--version'])).code === 0
        })

        it('refuses a clone with uncommitted work', async () => {
            if (!hasGit) return
            await makeClone('wip', true)

            await expect(removeExtension(await find('wip'), {}, context())).rejects.toMatchObject({
                code: 'EXTENSION_DIRTY',
            })

            await expect(stat(join(extensionsDir, 'td-wip'))).resolves.toBeTruthy()
        })

        it('removes a clone with uncommitted work when forced', async () => {
            if (!hasGit) return
            await makeClone('wip', true)

            await expect(
                removeExtension(await find('wip'), { force: true }, context()),
            ).resolves.toMatchObject({ removed: 'directory' })

            await expect(stat(join(extensionsDir, 'td-wip'))).rejects.toThrow()
        })

        it('removes a clean clone without being forced', async () => {
            if (!hasGit) return
            await makeClone('clean', false)

            await expect(
                removeExtension(await find('clean'), {}, context()),
            ).resolves.toMatchObject({ kind: 'git', removed: 'directory' })
        })
    })

    it('leaves no state behind for a reinstall to inherit', async () => {
        await writeFixtureExtension(extensionsDir, 'goals')
        await writeState(stateDir, 'td-goals', { pinned: 'v1.0.0' })

        await removeExtension(await find('goals'), {}, context())

        await expect(readState(stateDir, 'td-goals')).resolves.toEqual({})
    })
})

import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createExtension, listTemplates } from './create.js'

/** The templates td actually ships, so the tests cover the real files. */
const SHIPPED = fileURLToPath(new URL('../../../templates/extension/', import.meta.url))

describe('createExtension', () => {
    let root: string
    let templatesDir: string

    function context(overrides: { templatesDir?: string; reserved?: string[] } = {}) {
        return {
            binName: 'td',
            version: '5.3.2',
            templatesDir: overrides.templatesDir ?? templatesDir,
            reservedNames: () => overrides.reserved ?? [],
        }
    }

    /** A template of our own, so these tests do not move when the real ones do. */
    async function writeTemplate(name: string, files: Record<string, string>) {
        for (const [file, contents] of Object.entries(files)) {
            const path = join(templatesDir, name, file)
            await mkdir(join(path, '..'), { recursive: true })
            await writeFile(path, contents)
        }
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-create-'))
        templatesDir = join(root, 'templates')
        await writeTemplate('basic', {
            executable: '#!/bin/sh\necho {{NAME}} under {{BIN}} {{VERSION}}\n',
            'td-extension.json': '{"description":"{{DESCRIPTION}}"}',
            gitignore: 'node_modules/\n',
            '.github/workflows/release.yml': 'name: release {{DIRNAME}}\n',
        })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('writes the template into a directory named after the extension', async () => {
        const result = await createExtension('goals', { directory: root }, context())

        expect(result).toMatchObject({ name: 'goals', dirName: 'td-goals', template: 'basic' })
        expect((await readdir(join(root, 'td-goals'))).sort()).toEqual([
            '.github',
            '.gitignore',
            'td-extension.json',
            'td-goals',
        ])
    })

    it('names the executable after the extension and makes it runnable', async () => {
        await createExtension('goals', { directory: root }, context())

        const executable = join(root, 'td-goals', 'td-goals')
        // Owner-executable at least; the rest of the mode is the umask's business.
        expect((await stat(executable)).mode & 0o100).toBe(0o100)
        expect(await readFile(executable, 'utf8')).toContain('echo goals under td 5.3.2')
    })

    it('restores a dotfile carried under a name npm leaves alone', async () => {
        await createExtension('goals', { directory: root }, context())
        await expect(readFile(join(root, 'td-goals', '.gitignore'), 'utf8')).resolves.toContain(
            'node_modules/',
        )
    })

    it('keeps the shape of a nested path', async () => {
        await createExtension('goals', { directory: root }, context())
        await expect(
            readFile(join(root, 'td-goals', '.github/workflows/release.yml'), 'utf8'),
        ).resolves.toBe('name: release td-goals\n')
    })

    it('uses the description it is given, and a default when it is not', async () => {
        await createExtension('goals', { directory: root, description: 'Mine' }, context())
        await expect(
            readFile(join(root, 'td-goals', 'td-extension.json'), 'utf8'),
        ).resolves.toContain('Mine')

        await createExtension('other', { directory: root }, context())
        await expect(
            readFile(join(root, 'td-other', 'td-extension.json'), 'utf8'),
        ).resolves.toContain('A td extension')
    })

    it('accepts the command name or the directory name', async () => {
        const bare = await createExtension('goals', { directory: root }, context())
        const prefixed = await createExtension('td-other', { directory: root }, context())

        expect(bare.dirName).toBe('td-goals')
        expect(prefixed).toMatchObject({ name: 'other', dirName: 'td-other' })
    })

    it('refuses a name that could never be installed', async () => {
        await expect(
            createExtension('Not Valid', { directory: root }, context()),
        ).rejects.toMatchObject({ code: 'EXTENSION_NAME_INVALID' })
    })

    it('refuses a name a built-in command already uses', async () => {
        await expect(
            createExtension('task', { directory: root }, context({ reserved: ['task'] })),
        ).rejects.toMatchObject({ code: 'EXTENSION_NAME_RESERVED' })
        expect(await readdir(root)).not.toContain('td-task')
    })

    it('refuses to write over something that is already there', async () => {
        await mkdir(join(root, 'td-goals'))
        await expect(
            createExtension('goals', { directory: root }, context()),
        ).rejects.toMatchObject({ code: 'EXTENSION_ALREADY_EXISTS' })
    })

    it('names the templates there are when asked for one there is not', async () => {
        await writeTemplate('other', { executable: 'x' })
        await expect(
            createExtension('goals', { directory: root, template: 'nope' }, context()),
        ).rejects.toMatchObject({
            code: 'EXTENSION_TEMPLATE_INVALID',
            hints: ['Available templates: basic, other.'],
        })
    })

    it('refuses a template with a placeholder nothing fills', async () => {
        await writeTemplate('broken', { executable: 'echo {{NOT_A_VALUE}}\n' })
        await expect(
            createExtension('goals', { directory: root, template: 'broken' }, context()),
        ).rejects.toMatchObject({ code: 'EXTENSION_TEMPLATE_INVALID' })
    })
})

describe('the templates td ships', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-shipped-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('offers bash and node', async () => {
        expect(await listTemplates(SHIPPED)).toEqual(['bash', 'node'])
    })

    it.each(['bash', 'node'])('scaffolds a complete %s extension', async (template) => {
        const result = await createExtension(
            'goals',
            { directory: root, template },
            {
                binName: 'td',
                version: '5.3.2',
                templatesDir: SHIPPED,
                reservedNames: () => [],
            },
        )

        // The executable and the manifest are what make it an extension at all.
        expect(result.files).toContain('td-goals')
        expect(result.files).toContain('td-extension.json')
        expect(result.files).toContain('README.md')

        for (const file of result.files) {
            const contents = await readFile(join(result.dir, file), 'utf8')
            // `fill` refuses a placeholder it cannot resolve, so anything left
            // here would be a literal brace pair the template meant to keep.
            expect(contents).not.toMatch(/\{\{\w+\}\}/)
        }

        const manifest = JSON.parse(await readFile(join(result.dir, 'td-extension.json'), 'utf8'))
        expect(manifest).toMatchObject({ manifestVersion: 1, requires: { td: '>=5.3.2' } })
    })
})

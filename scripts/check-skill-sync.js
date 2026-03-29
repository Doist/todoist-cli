#!/usr/bin/env node

/**
 * Verifies that skills/todoist-cli/SKILL.md is in sync with the generated
 * skill content from src/lib/skills/content.ts.
 *
 * Requires `npm run build` to have been run first.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

try {
    const modulePath = pathToFileURL(join(root, 'dist/lib/skills/create-installer.js')).href
    const { generateSkillFile } = await import(modulePath)
    const expected = generateSkillFile()
    const actual = await readFile(join(root, 'skills/todoist-cli/SKILL.md'), 'utf-8')

    if (actual !== expected) {
        console.error(
            'ERROR: skills/todoist-cli/SKILL.md is out of sync with src/lib/skills/content.ts',
        )
        console.error('')
        console.error('To fix, run:')
        console.error('  npm run sync:skill')
        process.exit(1)
    }

    console.log('skills/todoist-cli/SKILL.md is in sync with content.ts')
} catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
        console.error('ERROR: dist/ not found. Run `npm run build` first.')
    } else {
        console.error(err)
    }
    process.exit(1)
}

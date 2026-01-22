import { access, mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { SKILL_CONTENT, SKILL_DESCRIPTION, SKILL_NAME } from './content.js'
import type { SkillInstaller } from './types.js'

function generateSkillFile(): string {
    const frontmatter = `---
name: ${SKILL_NAME}
description: ${SKILL_DESCRIPTION}
---

`
    return frontmatter + SKILL_CONTENT
}

function getGlobalPath(): string {
    return join(homedir(), '.claude', 'skills', 'todoist-cli', 'SKILL.md')
}

function getLocalPath(): string {
    return join(process.cwd(), '.claude', 'skills', 'todoist-cli', 'SKILL.md')
}

export const claudeCodeInstaller: SkillInstaller = {
    name: 'claude-code',
    description: 'Claude Code skill for Todoist CLI',

    getInstallPath(local: boolean): string {
        return local ? getLocalPath() : getGlobalPath()
    },

    generateContent(): string {
        return generateSkillFile()
    },

    async isInstalled(local: boolean): Promise<boolean> {
        const filepath = this.getInstallPath(local)
        try {
            await access(filepath)
            return true
        } catch {
            return false
        }
    },

    async install(local: boolean, force: boolean): Promise<void> {
        const filepath = this.getInstallPath(local)

        const exists = await this.isInstalled(local)
        if (exists && !force) {
            throw new Error(`Skill file already exists at ${filepath}. Use --force to overwrite.`)
        }

        const dir = dirname(filepath)
        await mkdir(dir, { recursive: true })
        await writeFile(filepath, this.generateContent(), 'utf-8')
    },

    async uninstall(local: boolean): Promise<void> {
        const filepath = this.getInstallPath(local)

        const exists = await this.isInstalled(local)
        if (!exists) {
            throw new Error(`Skill file not found at ${filepath}`)
        }

        await unlink(filepath)

        const dir = dirname(filepath)
        try {
            const files = await readdir(dir)
            if (files.length === 0) {
                await rmdir(dir)
            }
        } catch {
            // Ignore errors when cleaning up empty directory
        }
    },
}

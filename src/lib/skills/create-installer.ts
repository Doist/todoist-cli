import { access, mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { SKILL_CONTENT, SKILL_DESCRIPTION, SKILL_NAME } from './content.js'
import type { SkillInstaller } from './types.js'

interface InstallerConfig {
    name: string
    description: string
    dirName: string
}

function generateSkillFile(): string {
    const frontmatter = `---
name: ${SKILL_NAME}
description: ${SKILL_DESCRIPTION}
---

`
    return frontmatter + SKILL_CONTENT
}

export function createInstaller(config: InstallerConfig): SkillInstaller {
    function getInstallPath(local: boolean): string {
        const base = local ? process.cwd() : homedir()
        return join(base, config.dirName, 'skills', 'todoist-cli', 'SKILL.md')
    }

    return {
        name: config.name,
        description: config.description,

        getInstallPath,

        generateContent(): string {
            return generateSkillFile()
        },

        async isInstalled(local: boolean): Promise<boolean> {
            try {
                await access(getInstallPath(local))
                return true
            } catch {
                return false
            }
        },

        async install(local: boolean, force: boolean): Promise<void> {
            const filepath = getInstallPath(local)
            const exists = await this.isInstalled(local)
            if (exists && !force) {
                throw new Error(
                    `Skill file already exists at ${filepath}. Use --force to overwrite.`,
                )
            }
            await mkdir(dirname(filepath), { recursive: true })
            await writeFile(filepath, this.generateContent(), 'utf-8')
        },

        async uninstall(local: boolean): Promise<void> {
            const filepath = getInstallPath(local)
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
}

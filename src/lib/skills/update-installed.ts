import { skillInstallers } from './index.js'

export interface UpdateAllResult {
    updated: string[]
    skipped: string[]
    errors: string[]
}

export async function updateAllInstalledSkills(local: boolean): Promise<UpdateAllResult> {
    const updated: string[] = []
    const skipped: string[] = []
    const errors: string[] = []

    for (const [name, installer] of Object.entries(skillInstallers)) {
        try {
            const isInstalled = await installer.isInstalled(local)
            if (isInstalled) {
                await installer.update(local)
                updated.push(name)
            } else {
                skipped.push(name)
            }
        } catch {
            errors.push(name)
        }
    }

    return { updated, skipped, errors }
}

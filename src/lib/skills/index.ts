import { claudeCodeInstaller } from './claude-code.js'
import type { SkillInstaller } from './types.js'

export const skillInstallers: Record<string, SkillInstaller> = {
    'claude-code': claudeCodeInstaller,
}

export function getInstaller(agent: string): SkillInstaller | undefined {
    return skillInstallers[agent]
}

export function listAgents(): string[] {
    return Object.keys(skillInstallers)
}

export type { SkillInstaller } from './types.js'

import { access } from 'node:fs/promises'
import checkbox, { Separator } from '@inquirer/checkbox'
import chalk from 'chalk'
import { CliError } from '../../lib/errors.js'
import { getInstaller, listAgents, skillInstallers } from '../../lib/skills/index.js'
import type { SkillInstaller } from '../../lib/skills/types.js'

export interface InstallOptions {
    local?: boolean
    force?: boolean
}

interface InstallChoice {
    agent: string
    detected: boolean
    installer: SkillInstaller
}

interface PromptChoice {
    value: string
    name: string
    checked: boolean
    description: string
}

export function canPromptForSkillInstall(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

async function rootExists(installer: SkillInstaller, local: boolean): Promise<boolean> {
    try {
        await access(installer.getAgentRootPath(local))
        return true
    } catch {
        return false
    }
}

async function getInstallChoices(local: boolean): Promise<InstallChoice[]> {
    const choices = await Promise.all(
        listAgents().map(async (agent) => {
            const installer = skillInstallers[agent]
            return {
                agent,
                detected: await rootExists(installer, local),
                installer,
            }
        }),
    )

    const detectedNonUniversal = choices.filter(
        (choice) => choice.detected && choice.agent !== 'universal',
    )
    const detectedUniversal = choices.filter(
        (choice) => choice.detected && choice.agent === 'universal',
    )
    const undetectedNonUniversal = choices.filter(
        (choice) => !choice.detected && choice.agent !== 'universal',
    )
    const undetectedUniversal = choices.filter(
        (choice) => !choice.detected && choice.agent === 'universal',
    )
    const unavailableNonUniversal = local ? undetectedNonUniversal : []

    if (detectedNonUniversal.length > 0) {
        return [
            ...detectedNonUniversal,
            ...detectedUniversal,
            ...undetectedUniversal,
            ...unavailableNonUniversal,
        ]
    }

    return [...detectedUniversal, ...undetectedUniversal, ...unavailableNonUniversal]
}

function getPromptChoices(
    choices: InstallChoice[],
    local: boolean,
): Array<PromptChoice | Separator> {
    const [defaultChoice] = choices
    if (!defaultChoice) {
        return []
    }

    const detectedChoices = choices.filter((choice) => choice.detected)
    const undetectedChoices = choices.filter((choice) => !choice.detected)
    const groups: Array<PromptChoice | Separator> = []

    const mapChoices = (entries: InstallChoice[]): PromptChoice[] =>
        entries.map((choice) => {
            const status = choice.detected ? 'detected' : 'available'
            return {
                value: choice.agent,
                name: `${choice.agent} (${status})`,
                checked: choice.agent === defaultChoice.agent,
                description: choice.installer.getInstallPath(local),
            }
        })

    if (detectedChoices.length > 0 && undetectedChoices.length > 0) {
        groups.push(new Separator('Detected locations'))
        groups.push(...mapChoices(detectedChoices))
        groups.push(new Separator('Other supported agents'))
        groups.push(...mapChoices(undetectedChoices))
        return groups
    }

    return mapChoices(choices)
}

function isPromptCancelError(error: unknown): boolean {
    return (
        error instanceof Error &&
        ['AbortPromptError', 'CancelPromptError', 'ExitPromptError'].includes(error.name)
    )
}

async function promptForAgents(options: InstallOptions): Promise<string[]> {
    const local = options.local ?? false
    const choices = await getInstallChoices(local)
    const [defaultChoice] = choices
    if (!defaultChoice) {
        throw new CliError('NO_AGENTS', 'No skill installers are configured.')
    }
    const scopeLabel = local ? 'current project' : 'home directory'

    try {
        return await checkbox({
            message: `Select install targets. Detected locations in the ${scopeLabel} are shown first. Press Enter to install the current selection or Ctrl+C to cancel.`,
            choices: getPromptChoices(choices, local),
            loop: false,
            pageSize: Math.max(choices.length + 2, 6),
            shortcuts: {
                all: null,
                invert: null,
            },
            validate: (selectedChoices) => {
                return (
                    selectedChoices.length > 0 ||
                    `Select at least one agent, or press Ctrl+C to cancel. Press Enter to install ${defaultChoice.agent}.`
                )
            },
        })
    } catch (error) {
        if (isPromptCancelError(error)) {
            return []
        }
        throw error
    }
}

export async function promptAndInstallSkill(options: InstallOptions): Promise<void> {
    const agents = await promptForAgents(options)
    if (agents.length === 0) {
        console.log(chalk.dim('Cancelled.'))
        return
    }

    await validateInstallTargets(agents, options)

    for (const agent of agents) {
        await installSkill(agent, options)
    }
}

async function validateInstallTargets(agents: string[], options: InstallOptions): Promise<void> {
    const local = options.local ?? false
    const force = options.force ?? false

    await Promise.all(
        agents.map(async (agent) => {
            const installer = getInstaller(agent)
            if (!installer) {
                const available = listAgents().join(', ')
                throw new CliError('UNKNOWN_AGENT', `Unknown agent: ${agent}`, [
                    `Available agents: ${available}`,
                ])
            }

            if (!local && agent !== 'universal' && !(await rootExists(installer, false))) {
                throw new CliError(
                    'NOT_INSTALLED',
                    `${agent} does not appear to be installed (${installer.getAgentRootPath(false)} not found)`,
                )
            }

            if (!force && (await installer.isInstalled(local))) {
                throw new CliError(
                    'ALREADY_EXISTS',
                    `Skill file already exists at ${installer.getInstallPath(local)}. Use --force to overwrite.`,
                )
            }
        }),
    )
}

export async function installSkill(agent: string, options: InstallOptions): Promise<void> {
    const installer = getInstaller(agent)
    if (!installer) {
        const available = listAgents().join(', ')
        throw new CliError('UNKNOWN_AGENT', `Unknown agent: ${agent}`, [
            `Available agents: ${available}`,
        ])
    }

    const local = options.local ?? false
    const force = options.force ?? false

    await installer.install(local, force)

    const filepath = installer.getInstallPath(local)
    console.log(chalk.green('✓'), `Installed ${installer.name} skill`)
    console.log(chalk.dim(filepath))
}

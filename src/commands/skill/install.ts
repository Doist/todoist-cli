import { access } from 'node:fs/promises'
import { createInterface } from 'node:readline'
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

    if (detectedNonUniversal.length > 0) {
        return [
            ...detectedNonUniversal,
            ...detectedUniversal,
            ...undetectedNonUniversal,
            ...undetectedUniversal,
        ]
    }

    return [...detectedUniversal, ...undetectedUniversal, ...undetectedNonUniversal]
}

async function promptForAgent(options: InstallOptions): Promise<string> {
    const local = options.local ?? false
    const choices = await getInstallChoices(local)
    const [defaultChoice] = choices
    if (!defaultChoice) {
        throw new CliError('NO_AGENTS', 'No skill installers are configured.')
    }
    const scopeLabel = local ? 'current project' : 'home directory'

    console.log('Select where to install the Todoist CLI skill:')
    console.log(`Checking agent roots in the ${scopeLabel}; detected locations are shown first.`)
    console.log('')

    for (const [index, choice] of choices.entries()) {
        const annotations: string[] = []
        if (index === 0) {
            annotations.push('default')
        }
        if (choice.detected) {
            annotations.push('detected')
        }
        const annotation = annotations.length > 0 ? ` (${annotations.join(', ')})` : ''
        console.log(`  ${index + 1}. ${choice.agent}${annotation}`)
        console.log(`     ${chalk.dim(choice.installer.getInstallPath(local))}`)
    }

    console.log('Press Ctrl+C to cancel without installing.')
    console.log('')

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise((resolve, reject) => {
        rl.on('SIGINT', () => {
            rl.close()
            process.stdout.write('\n')
            resolve('')
        })

        rl.question(`Enter a number [1]: `, (answer) => {
            rl.close()
            const input = answer.trim()

            if (!input) {
                resolve(defaultChoice.agent)
                return
            }

            const selection = Number.parseInt(input, 10)
            if (Number.isNaN(selection) || selection < 1 || selection > choices.length) {
                reject(
                    new CliError('INVALID_SELECTION', `Invalid selection: ${input}`, [
                        `Enter a number from 1 to ${choices.length}, or press Enter for ${defaultChoice.agent}. Press Ctrl+C to cancel.`,
                    ]),
                )
                return
            }

            const selectedChoice = choices[selection - 1]
            if (!selectedChoice) {
                reject(new CliError('INVALID_SELECTION', `Invalid selection: ${input}`))
                return
            }

            resolve(selectedChoice.agent)
        })
    })
}

export async function promptAndInstallSkill(options: InstallOptions): Promise<void> {
    const agent = await promptForAgent(options)
    if (!agent) {
        console.log(chalk.dim('Cancelled.'))
        return
    }
    await installSkill(agent, options)
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

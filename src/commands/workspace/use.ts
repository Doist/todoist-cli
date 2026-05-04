import chalk from 'chalk'
import { readConfig, writeConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

export interface UseWorkspaceOptions {
    clear?: boolean
}

export async function useWorkspace(
    ref: string | undefined,
    options: UseWorkspaceOptions = {},
): Promise<void> {
    if (options.clear && ref) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot pass a workspace ref together with --clear.',
            ['Use one or the other: `td workspace use <ref>` OR `td workspace use --clear`.'],
        )
    }

    if (options.clear) {
        await clearDefaultWorkspace()
        return
    }

    if (!ref) {
        throw new CliError(
            'INVALID_OPTIONS',
            'A workspace ref is required unless --clear is passed.',
            [
                'Example: `td workspace use "My Workspace"`',
                'Clear with: `td workspace use --clear`',
            ],
        )
    }

    const workspace = await resolveWorkspaceRef(ref)

    const config = await readConfig()
    const existing = isPlainObject(config.workspace) ? config.workspace : {}
    config.workspace = { ...existing, defaultWorkspace: workspace.id }
    await writeConfig(config)

    console.log(
        chalk.green('✓'),
        `Default workspace set to ${chalk.cyan(workspace.name)} ${chalk.dim(`(id:${workspace.id})`)}`,
    )
}

async function clearDefaultWorkspace(): Promise<void> {
    const config = await readConfig()
    const existing = isPlainObject(config.workspace) ? { ...config.workspace } : undefined

    if (!existing || existing.defaultWorkspace === undefined) {
        console.log(chalk.dim('No default workspace was set.'))
        return
    }

    delete existing.defaultWorkspace
    if (Object.keys(existing).length === 0) {
        delete config.workspace
    } else {
        config.workspace = existing
    }
    await writeConfig(config)

    console.log(chalk.green('✓'), 'Default workspace cleared.')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

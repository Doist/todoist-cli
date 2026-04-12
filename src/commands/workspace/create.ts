import type { AddWorkspaceArgs } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { clearWorkspaceCache, fetchWorkspaces } from '../../lib/api/workspaces.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { formatWorkspaceJson } from './helpers.js'

export interface CreateWorkspaceOptions {
    name?: string
    description?: string
    linkSharing?: boolean
    guestAccess?: boolean
    domain?: string
    domainDiscovery?: boolean
    restrictEmailDomains?: boolean
    json?: boolean
    full?: boolean
    dryRun?: boolean
}

export async function createWorkspace(options: CreateWorkspaceOptions): Promise<void> {
    if (!options.name) {
        throw new Error('missing required --name')
    }

    const args: AddWorkspaceArgs = { name: options.name }
    if (options.description !== undefined) args.description = options.description
    if (options.linkSharing !== undefined) args.isLinkSharingEnabled = options.linkSharing
    if (options.guestAccess !== undefined) args.isGuestAllowed = options.guestAccess
    if (options.domain !== undefined) args.domainName = options.domain
    if (options.domainDiscovery !== undefined) args.domainDiscovery = options.domainDiscovery
    if (options.restrictEmailDomains !== undefined) {
        args.restrictEmailDomains = options.restrictEmailDomains
    }

    if (options.dryRun) {
        printDryRun('create workspace', {
            Name: options.name,
            Description: options.description,
            'Link sharing':
                options.linkSharing !== undefined ? String(options.linkSharing) : undefined,
            'Guest access':
                options.guestAccess !== undefined ? String(options.guestAccess) : undefined,
            Domain: options.domain,
            'Domain discovery':
                options.domainDiscovery !== undefined ? String(options.domainDiscovery) : undefined,
            'Restrict email domains':
                options.restrictEmailDomains !== undefined
                    ? String(options.restrictEmailDomains)
                    : undefined,
        })
        return
    }

    const api = await getApi()
    const workspace = await api.addWorkspace(args)
    clearWorkspaceCache()

    if (options.json) {
        // Emit the curated Workspace shape used by `workspace view --json`
        // so scripts see a consistent contract across create/view/update.
        // Fall back to the raw SDK response if sync hasn't picked up the
        // new workspace yet.
        const refreshed = (await fetchWorkspaces()).find((w) => w.id === workspace.id)
        console.log(
            JSON.stringify(
                refreshed ? formatWorkspaceJson(refreshed, options.full ?? false) : workspace,
                null,
                2,
            ),
        )
        return
    }

    if (isQuiet()) {
        console.log(workspace.id)
        return
    }

    console.log(`Created: ${workspace.name}`)
    console.log(chalk.dim(`ID: ${workspace.id}`))
}

import type { UpdateWorkspaceArgs } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { clearWorkspaceCache } from '../../lib/api/workspaces.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'
import { assertWorkspaceAdmin } from './helpers.js'

export interface UpdateWorkspaceOptions {
    name?: string
    description?: string
    linkSharing?: boolean
    guestAccess?: boolean
    domain?: string
    domainDiscovery?: boolean
    restrictEmailDomains?: boolean
    collapsed?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function updateWorkspaceCommand(
    ref: string,
    options: UpdateWorkspaceOptions,
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    // Admin check must run BEFORE dry-run short-circuit so a non-admin's
    // preview still fails loudly — otherwise a dry-run would lie about
    // what would happen.
    assertWorkspaceAdmin(workspace, 'update')

    const args: UpdateWorkspaceArgs = {}
    if (options.name !== undefined) args.name = options.name
    if (options.description !== undefined) args.description = options.description
    if (options.linkSharing !== undefined) args.isLinkSharingEnabled = options.linkSharing
    if (options.guestAccess !== undefined) args.isGuestAllowed = options.guestAccess
    if (options.domain !== undefined) args.domainName = options.domain
    if (options.domainDiscovery !== undefined) args.domainDiscovery = options.domainDiscovery
    if (options.restrictEmailDomains !== undefined) {
        args.restrictEmailDomains = options.restrictEmailDomains
    }
    if (options.collapsed !== undefined) args.isCollapsed = options.collapsed

    if (Object.keys(args).length === 0) {
        throw new CliError('NO_CHANGES', 'No changes specified.')
    }

    if (options.dryRun) {
        printDryRun('update workspace', {
            Workspace: workspace.name,
            Name: args.name,
            Description: args.description ?? undefined,
            'Link sharing':
                args.isLinkSharingEnabled !== undefined
                    ? String(args.isLinkSharingEnabled)
                    : undefined,
            'Guest access':
                args.isGuestAllowed !== undefined && args.isGuestAllowed !== null
                    ? String(args.isGuestAllowed)
                    : undefined,
            Domain: args.domainName ?? undefined,
            'Domain discovery':
                args.domainDiscovery !== undefined ? String(args.domainDiscovery) : undefined,
            'Restrict email domains':
                args.restrictEmailDomains !== undefined
                    ? String(args.restrictEmailDomains)
                    : undefined,
            Collapsed: args.isCollapsed !== undefined ? String(args.isCollapsed) : undefined,
        })
        return
    }

    const api = await getApi()
    const updated = await api.updateWorkspace(workspace.id, args)
    clearWorkspaceCache()

    if (options.json) {
        console.log(JSON.stringify(updated, null, 2))
        return
    }

    if (!isQuiet()) {
        console.log(
            `Updated: ${workspace.name}${
                options.name && options.name !== workspace.name ? ` → ${updated.name}` : ''
            } (id:${workspace.id})`,
        )
    }
}

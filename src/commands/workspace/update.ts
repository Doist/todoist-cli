import type { UpdateWorkspaceArgs } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { clearWorkspaceCache, fetchWorkspaces } from '../../lib/api/workspaces.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'
import { assertWorkspaceAdmin, formatWorkspaceJson } from './helpers.js'

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
    full?: boolean
    dryRun?: boolean
}

export async function updateWorkspaceCommand(
    ref: string,
    options: UpdateWorkspaceOptions,
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)

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

    // Guard no-op calls before the admin check — a user who forgot their
    // flags should see NO_CHANGES, not NOT_ADMIN, since no mutation is
    // actually being attempted.
    if (Object.keys(args).length === 0) {
        throw new CliError('NO_CHANGES', 'No changes specified.')
    }

    // Admin check runs BEFORE the dry-run short-circuit so a non-admin's
    // preview still fails loudly — otherwise a dry-run would lie about
    // what would happen.
    assertWorkspaceAdmin(workspace, 'update')

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
        // Re-fetch via sync so we emit the curated Workspace shape that
        // `workspace view --json` uses — keeps the contract consistent for
        // scripts that round-trip through read commands. Fall back to the
        // raw SDK response if sync doesn't yet list it (shouldn't happen
        // post-update, but be safe).
        const refreshed = (await fetchWorkspaces()).find((w) => w.id === workspace.id)
        console.log(
            JSON.stringify(
                refreshed ? formatWorkspaceJson(refreshed, options.full ?? false) : updated,
                null,
                2,
            ),
        )
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

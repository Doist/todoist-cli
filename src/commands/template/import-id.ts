import { getApi } from '../../lib/api/core.js'
import { formatError, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { formatImportResult } from './helpers.js'

export interface ImportIdOptions {
    project?: string
    templateId: string
    locale?: string
    json?: boolean
    dryRun?: boolean
}

export async function importTemplateById(
    projectArg: string | undefined,
    options: ImportIdOptions,
): Promise<void> {
    const ref = projectArg || options.project
    if (!ref) {
        throw new Error('Project reference is required')
    }
    if (!options.templateId) {
        throw new Error(
            formatError('MISSING_TEMPLATE_ID', 'Template ID is required (--template-id)'),
        )
    }

    if (options.dryRun) {
        printDryRun('import template by ID into project', {
            Project: ref,
            'Template ID': options.templateId,
            Locale: options.locale,
        })
        return
    }

    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const result = await api.importTemplateFromId({
        projectId: project.id,
        templateId: options.templateId,
        locale: options.locale,
    })

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    formatImportResult(result)
}

import { getApi } from '../../lib/api/core.js'
import { fetchFilters } from '../../lib/api/filters.js'
import { fetchUserSettings } from '../../lib/api/user-settings.js'
import type { ViewOptions } from '../../lib/options.js'
import { withSpinner } from '../../lib/spinner.js'
import { formatSettingsForJson, formatSettingsView, parseStartPageRef } from './helpers.js'

async function resolveStartPageName(startPage: string): Promise<string | null> {
    const ref = parseStartPageRef(startPage)
    if (!ref) return null

    try {
        const api = await getApi()
        switch (ref.type) {
            case 'project': {
                const project = await api.getProject(ref.id)
                return project.name
            }
            case 'label': {
                const label = await api.getLabel(ref.id)
                return label.name
            }
            case 'filter': {
                const filters = await fetchFilters()
                const filter = filters.find((f) => f.id === ref.id)
                return filter?.name ?? null
            }
        }
    } catch {
        return null
    }
}

export async function viewSettings(options: ViewOptions): Promise<void> {
    const { settings, startPageName } = await withSpinner(
        { text: 'Loading settings...', color: 'blue' },
        async () => {
            const settings = await fetchUserSettings()
            const startPageName = await resolveStartPageName(settings.startPage)
            return { settings, startPageName }
        },
    )

    if (options.json) {
        console.log(JSON.stringify(formatSettingsForJson(settings, startPageName), null, 2))
        return
    }

    console.log(formatSettingsView(settings, startPageName))
}

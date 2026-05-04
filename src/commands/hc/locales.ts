import chalk from 'chalk'
import { getHelpCenterLocales } from '../../lib/help-center.js'
import { withSpinner } from '../../lib/spinner.js'

export interface ListHelpCenterLocalesOptions {
    json?: boolean
}

export async function listHelpCenterLocales(
    options: ListHelpCenterLocalesOptions = {},
): Promise<void> {
    const result = await withSpinner(
        { text: 'Loading Help Center locales...', color: 'blue' },
        () => getHelpCenterLocales(),
    )

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    console.log(`Default locale: ${result.defaultLocale}`)
    console.log('')
    console.log('Supported locales:')

    for (const locale of result.locales) {
        const defaultTag = locale.isDefault ? ` ${chalk.dim('[default]')}` : ''
        console.log(`  ${locale.locale}  ${locale.name}${defaultTag}`)
    }
}

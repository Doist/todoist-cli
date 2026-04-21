import chalk from 'chalk'
import { readConfig, writeConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import {
    DEFAULT_HELP_CENTER_LOCALE,
    getHelpCenterLocales,
    normalizeHelpCenterLocale,
} from '../../lib/help-center.js'
import { withSpinner } from '../../lib/spinner.js'

export async function setDefaultHelpCenterLocale(locale: string): Promise<void> {
    const normalized = normalizeHelpCenterLocale(locale)

    const { locales } = await withSpinner(
        { text: 'Checking locale...', color: 'blue' },
        () => getHelpCenterLocales(),
    )

    const supported = locales.map((entry) => entry.locale)
    if (!supported.includes(normalized)) {
        throw new CliError(
            'INVALID_OPTIONS',
            `"${normalized}" is not a supported Help Center locale.`,
            [
                `Supported locales: ${supported.join(', ')}.`,
                'Run `td hc locales` for details on each locale.',
            ],
        )
    }

    const config = await readConfig()
    config.hc = { ...config.hc, defaultLocale: normalized }
    await writeConfig(config)

    console.log(chalk.green('✓'), `Default Help Center locale set to ${chalk.cyan(normalized)}`)
}

export async function resolveDefaultHelpCenterLocale(explicit?: string): Promise<string> {
    if (explicit !== undefined) {
        return normalizeHelpCenterLocale(explicit)
    }
    const config = await readConfig()
    return normalizeHelpCenterLocale(config.hc?.defaultLocale ?? DEFAULT_HELP_CENTER_LOCALE)
}

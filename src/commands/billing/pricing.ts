import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { type BillingViewOptions, formatMoney, outputMachine, resolveLocale } from './format.js'

interface PricingOptions extends BillingViewOptions {
    formatted?: boolean
}

export async function viewPricing(options: PricingOptions = {}): Promise<void> {
    const api = await getApi()
    // `--formatted` returns pre-localized strings, so locale (and the getUser
    // fetch it costs) is only needed for the numeric formatting branch.
    const locale = options.formatted ? undefined : await resolveLocale(api, options)
    const pricing = await api.getPricing({ formatted: options.formatted })

    if (outputMachine(pricing, options)) return

    const { latestPro, latestBiz, sessionPro, sessionBiz, ...versions } = pricing

    console.log(chalk.bold('Pricing'))
    console.log('')
    console.log(`  Latest Pro:         ${latestPro}`)
    console.log(`  Latest Business:    ${latestBiz}`)
    console.log(`  Session Pro:        ${sessionPro}`)
    console.log(`  Session Business:   ${sessionBiz}`)

    for (const [version, plans] of Object.entries(versions)) {
        // Only render keys that look like version pointers (v1, v25, …). Any
        // other top-level field the SDK might add — scalar or object — is
        // metadata, not a pricing version, and must not be rendered as one.
        if (!/^v\d+/.test(version)) continue
        console.log('')
        console.log(chalk.bold(`  ${version}`))
        for (const [plan, currencies] of Object.entries(plans)) {
            for (const [currency, terms] of Object.entries(currencies)) {
                const monthly = formatTerm(terms.monthly, currency, locale)
                const yearly = formatTerm(terms.yearly, currency, locale)
                console.log(`    ${plan} (${currency.toUpperCase()}): ${monthly}/mo, ${yearly}/yr`)
            }
        }
    }
}

/**
 * Pricing amounts are minor units (numbers) by default, or pre-formatted
 * localized strings when the endpoint is called with `--formatted`.
 */
function formatTerm(value: number | string, currency: string, locale?: string): string {
    return typeof value === 'number' ? formatMoney(value, currency, locale) : value
}

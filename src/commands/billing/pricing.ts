import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { type BillingViewOptions, formatMoney, outputMachine } from './format.js'

interface PricingOptions extends BillingViewOptions {
    formatted?: boolean
}

export async function viewPricing(options: PricingOptions = {}): Promise<void> {
    const api = await getApi()
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
        console.log('')
        console.log(chalk.bold(`  ${version}`))
        for (const [plan, currencies] of Object.entries(plans)) {
            for (const [currency, terms] of Object.entries(currencies)) {
                const monthly = formatTerm(terms.monthly, currency)
                const yearly = formatTerm(terms.yearly, currency)
                console.log(`    ${plan} (${currency.toUpperCase()}): ${monthly}/mo, ${yearly}/yr`)
            }
        }
    }
}

/**
 * Pricing amounts are minor units (numbers) by default, or pre-formatted
 * localized strings when the endpoint is called with `--formatted`.
 */
function formatTerm(value: number | string, currency: string): string {
    return typeof value === 'number' ? formatMoney(value, currency) : value
}

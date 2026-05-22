import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { type BillingViewOptions, formatListing, outputMachine, resolveLocale } from './format.js'

export async function viewPrices(options: BillingViewOptions = {}): Promise<void> {
    const api = await getApi()
    const locale = await resolveLocale(api, options)
    const prices = await api.getPrices()

    if (outputMachine(prices, options)) return

    console.log(chalk.bold('Prices'))
    console.log('')
    console.log(chalk.bold('  Pro'))
    for (const listing of prices.pro) {
        console.log(`    ${formatListing(listing, locale)}`)
    }
    console.log('')
    console.log(chalk.bold('  Teams'))
    for (const listing of prices.teams) {
        console.log(`    ${formatListing(listing, locale)}`)
    }
}

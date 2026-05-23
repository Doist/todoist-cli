import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { type BillingViewOptions, formatMoney, outputMachine, resolveLocale } from './format.js'

export async function viewSubscription(options: BillingViewOptions = {}): Promise<void> {
    const api = await getApi()
    const locale = await resolveLocale(api, options)
    const info = await api.getSubscriptionInfo()

    if (outputMachine(info, options)) return

    console.log(chalk.bold('Subscription'))
    console.log('')
    console.log(`  Plan:               ${info.plan}`)
    console.log(`  Status:             ${info.status}`)
    console.log(`  Activation:         ${info.activationMethod}`)
    console.log(`  Expires:            ${info.expirationDate ?? chalk.dim('(none)')}`)

    if (info.planPrice) {
        const { rawAmount, currency, billingCycle } = info.planPrice
        const cycle = billingCycle ? `/${billingCycle === 'yearly' ? 'yr' : 'mo'}` : ''
        console.log(`  Price:              ${formatMoney(rawAmount, currency, locale)}${cycle}`)
    } else {
        console.log(`  Price:              ${chalk.dim('(none)')}`)
    }

    if (info.invoiceCreditBalance && Object.keys(info.invoiceCreditBalance).length > 0) {
        const credits = Object.entries(info.invoiceCreditBalance)
            .map(([currency, amount]) => formatMoney(amount, currency, locale))
            .join(', ')
        console.log(`  Credit balance:     ${credits}`)
    }

    if (info.hasBillingPortal && info.billingPortalUrl) {
        console.log(`  Billing portal:     ${info.billingPortalUrl}`)
    }
    if (info.hasBillingPortalSwitchToAnnual && info.billingPortalSwitchToAnnualUrl) {
        console.log(`  Switch to annual:   ${info.billingPortalSwitchToAnnualUrl}`)
    }
}

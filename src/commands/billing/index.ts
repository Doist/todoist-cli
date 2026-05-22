import { Command } from 'commander'
import { viewPlan } from './plan.js'
import { viewPrices } from './prices.js'
import { viewPricing } from './pricing.js'
import { viewSubscription } from './subscription.js'

export function registerBillingCommand(program: Command): void {
    const billing = program
        .command('billing')
        .description('View billing and subscription information')
        .addHelpText(
            'after',
            `
Examples:
  td billing
  td billing subscription --json
  td billing plan
  td billing prices
  td billing pricing --formatted

Requires authenticating with the billing scope:
  td auth login --additional-scopes=billing`,
        )

    billing
        .command('subscription', { isDefault: true })
        .description('Show your current subscription status and plan')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(viewSubscription)

    billing
        .command('plan')
        .description('Show your Pro plan and billing details')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(viewPlan)

    billing
        .command('prices')
        .description('Show available Pro and Teams prices')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(viewPrices)

    billing
        .command('pricing')
        .description('Show current and legacy pricing by version')
        .option('--formatted', 'Return localized formatted price strings')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(viewPricing)
}

import type { PriceListing } from '@doist/todoist-sdk'

export interface BillingViewOptions {
    json?: boolean
    ndjson?: boolean
}

/**
 * Emit the raw payload as JSON (`--json`, indented) or NDJSON (`--ndjson`,
 * single line) and report whether machine output was produced, so callers can
 * early-return before rendering the human view. Billing responses are not
 * `output.ts` entity types, so they're serialized verbatim.
 */
export function outputMachine(payload: unknown, options: BillingViewOptions): boolean {
    if (!options.json && !options.ndjson) return false
    const indent = options.json ? 2 : undefined
    console.log(JSON.stringify(payload, null, indent))
    return true
}

/** Format an amount given in a currency's minor units (e.g. cents) as money. */
export function formatMoney(minorUnits: number, currency: string): string {
    const code = currency.toUpperCase()
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(
            minorUnits / 100,
        )
    } catch {
        return `${code} ${(minorUnits / 100).toFixed(2)}`
    }
}

/** Render a single billing-cycle price listing, e.g. `monthly: $6.00, €6.00`. */
export function formatListing(listing: PriceListing): string {
    const prices = listing.prices.map((p) => formatMoney(p.unitAmount, p.currency)).join(', ')
    return `${listing.billingCycle}: ${prices}`
}

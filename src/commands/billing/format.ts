import type { PriceListing } from '@doist/todoist-sdk'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson } from '../../lib/output.js'

export type BillingViewOptions = Pick<ViewOptions, 'json' | 'ndjson'>

/**
 * Emit the raw payload as JSON (`--json`) or NDJSON (`--ndjson`) and report
 * whether machine output was produced, so callers can early-return before
 * rendering the human view. Reuses the shared `output.ts` helpers so billing
 * machine output matches the rest of the CLI.
 */
export function outputMachine(payload: object, options: BillingViewOptions): boolean {
    if (options.json) {
        console.log(formatJson(payload))
        return true
    }
    if (options.ndjson) {
        console.log(formatNdjson([payload]))
        return true
    }
    return false
}

// `Intl.NumberFormat` construction is comparatively slow, and `formatMoney` is
// called in nested loops (pricing), so cache per currency + decimal-mode.
const formatterCache = new Map<string, Intl.NumberFormat>()
const fractionDigitsCache = new Map<string, number>()

/**
 * Number of fraction digits the currency uses (USD→2, JPY→0, BHD→3). Doubles
 * as the minor-unit exponent: the divisor to convert minor units to major is
 * `10 ** fractionDigits`.
 */
function currencyFractionDigits(currency: string): number {
    let digits = fractionDigitsCache.get(currency)
    if (digits === undefined) {
        digits =
            new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
                .maximumFractionDigits ?? 2
        fractionDigitsCache.set(currency, digits)
    }
    return digits
}

function getFormatter(currency: string, minimumFractionDigits: number): Intl.NumberFormat {
    const key = `${currency}|${minimumFractionDigits}`
    let formatter = formatterCache.get(key)
    if (!formatter) {
        formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits,
        })
        formatterCache.set(key, formatter)
    }
    return formatter
}

/**
 * Format an amount given in a currency's minor units (e.g. cents) as money.
 * Mirrors todoist-web's `formatPrice`: the divisor comes from the currency's
 * fraction digits (so JPY isn't rendered 100× too small), and whole amounts
 * drop the decimals (`$6`, not `$6.00`).
 */
export function formatMoney(minorUnits: number, currency: string): string {
    const code = currency.toUpperCase()
    try {
        const major = minorUnits / 10 ** currencyFractionDigits(code)
        return getFormatter(code, Number.isInteger(major) ? 0 : 2).format(major)
    } catch {
        // Unknown/invalid currency code — Intl throws. Fall back to the raw
        // minor-unit number rather than guessing a divisor.
        return `${code} ${minorUnits}`
    }
}

/** Render a single billing-cycle price listing, e.g. `monthly: $6, €6`. */
export function formatListing(listing: PriceListing): string {
    const prices = listing.prices.map((p) => formatMoney(p.unitAmount, p.currency)).join(', ')
    return `${listing.billingCycle}: ${prices}`
}

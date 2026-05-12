import { CliError } from './errors.js'

export function parseOrderArg(val: string): number {
    const n = Number(val)
    if (!Number.isInteger(n) || n < 0) {
        throw new CliError('INVALID_ORDER', `Invalid order value: "${val}"`, [
            'Order must be a non-negative integer (e.g., 0 for top of list)',
        ])
    }
    return n
}

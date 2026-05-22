import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/api/core.js')>()
    return {
        ...actual,
        getApi: vi.fn(),
    }
})

import { setupApiMock } from '../../test-support/api-mock.js'
import { mockConsoleLog } from '../../test-support/console-spy.js'
import { fixtures } from '../../test-support/fixtures.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { createTestProgram } from '../../test-support/program.js'
import { resolveLocale } from './format.js'
import { registerBillingCommand } from './index.js'

function createProgram() {
    return createTestProgram(registerBillingCommand)
}

describe('billing subscription', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        mockApi.getUser.mockResolvedValue({ lang: 'en' })
    })

    it('is the default subcommand and renders the subscription summary', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSubscriptionInfo.mockResolvedValue(fixtures.billing.subscription)

        // No subcommand given → default subscription
        await program.parseAsync(['node', 'td', 'billing'])

        expect(mockApi.getSubscriptionInfo).toHaveBeenCalledTimes(1)
        // Human output resolves the user's locale for money formatting.
        expect(mockApi.getUser).toHaveBeenCalledTimes(1)
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Plan:               pro')
        expect(output).toContain('Status:             autorenew')
        expect(output).toContain('Activation:         stripe')
        expect(output).toContain('Expires:            2026-12-31')
        expect(output).toContain('$6/mo')
        expect(output).toContain('https://billing.stripe.com/portal/abc')
    })

    it('outputs the raw payload with --json', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSubscriptionInfo.mockResolvedValue(fixtures.billing.subscription)

        await program.parseAsync(['node', 'td', 'billing', 'subscription', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(JSON.parse(output)).toEqual(fixtures.billing.subscription)
        // Machine output dumps the raw payload, so it must not pay for getUser.
        expect(mockApi.getUser).not.toHaveBeenCalled()
    })

    it('outputs single-line JSON with --ndjson', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSubscriptionInfo.mockResolvedValue(fixtures.billing.subscription)

        await program.parseAsync(['node', 'td', 'billing', 'subscription', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).not.toContain('\n')
        expect(JSON.parse(output)).toEqual(fixtures.billing.subscription)
    })

    it('renders a free plan with no price gracefully', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSubscriptionInfo.mockResolvedValue({
            ...fixtures.billing.subscription,
            status: 'none',
            plan: 'free',
            expirationDate: null,
            planPrice: null,
            invoiceCreditBalance: null,
            hasBillingPortal: false,
            billingPortalUrl: null,
        })

        await program.parseAsync(['node', 'td', 'billing'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Plan:               free')
        expect(output).toContain('Price:              (none)')
    })
})

describe('billing plan', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        mockApi.getUser.mockResolvedValue({ lang: 'en' })
    })

    it('renders pro plan details', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getProPlanDetails.mockResolvedValue(fixtures.billing.proPlanDetails)

        await program.parseAsync(['node', 'td', 'billing', 'plan'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Status:             Active')
        expect(output).toContain('Downgrade at:       (none)')
        expect(output).toContain('monthly: $6')
    })

    it('outputs the raw payload with --json', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getProPlanDetails.mockResolvedValue(fixtures.billing.proPlanDetails)

        await program.parseAsync(['node', 'td', 'billing', 'plan', '--json'])

        expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual(
            fixtures.billing.proPlanDetails,
        )
    })
})

describe('billing prices', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        mockApi.getUser.mockResolvedValue({ lang: 'en' })
    })

    it('renders pro and teams price listings', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getPrices.mockResolvedValue(fixtures.billing.prices)

        await program.parseAsync(['node', 'td', 'billing', 'prices'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Pro')
        expect(output).toContain('yearly: $60')
        expect(output).toContain('Teams')
        expect(output).toContain('monthly: $8')
    })
})

describe('billing pricing', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        mockApi.getUser.mockResolvedValue({ lang: 'en' })
    })

    it('formats minor-unit numbers as money and lists version entries', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getPricing.mockResolvedValue(fixtures.billing.pricing)

        await program.parseAsync(['node', 'td', 'billing', 'pricing'])

        expect(mockApi.getPricing).toHaveBeenCalledWith({ formatted: undefined })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Latest Pro:         v25')
        expect(output).toContain('v25')
        expect(output).toContain('pro (USD): $4/mo, $29/yr')
    })

    it('does not render non-version metadata keys as pricing versions', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getPricing.mockResolvedValue(fixtures.billing.pricingWithMetadata)

        await program.parseAsync(['node', 'td', 'billing', 'pricing'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).not.toContain('revision')
        // The real version block is still rendered.
        expect(output).toContain('pro (USD): $4/mo, $29/yr')
    })

    it('passes --formatted through, prints strings as-is, and skips the locale fetch', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getPricing.mockResolvedValue(fixtures.billing.pricingFormatted)

        await program.parseAsync(['node', 'td', 'billing', 'pricing', '--formatted'])

        expect(mockApi.getPricing).toHaveBeenCalledWith({ formatted: true })
        // Formatted strings ignore locale, so the getUser fetch is skipped.
        expect(mockApi.getUser).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('pro (USD): $4/mo, $29/yr')
    })
})

describe('resolveLocale', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('maps the user language to a BCP-47 tag (pt_BR → pt-BR)', async () => {
        mockApi.getUser.mockResolvedValue({ lang: 'pt_BR' })
        expect(await resolveLocale(mockApi, {})).toBe('pt-BR')
    })

    it('skips the getUser fetch for machine output', async () => {
        expect(await resolveLocale(mockApi, { json: true })).toBeUndefined()
        expect(await resolveLocale(mockApi, { ndjson: true })).toBeUndefined()
        expect(mockApi.getUser).not.toHaveBeenCalled()
    })
})

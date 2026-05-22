import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/api/core.js')>()
    return {
        ...actual,
        getApi: vi.fn(),
    }
})

import { getApi } from '../../lib/api/core.js'
import { fixtures } from '../../test-support/fixtures.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import { registerBillingCommand } from './index.js'

const mockGetApi = vi.mocked(getApi)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerBillingCommand(program)
    return program
}

describe('billing subscription', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('is the default subcommand and renders the subscription summary', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getSubscriptionInfo.mockResolvedValue(fixtures.billing.subscription)

        // No subcommand given → default subscription
        await program.parseAsync(['node', 'td', 'billing'])

        expect(mockApi.getSubscriptionInfo).toHaveBeenCalledTimes(1)
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Plan:               pro')
        expect(output).toContain('Status:             autorenew')
        expect(output).toContain('Activation:         stripe')
        expect(output).toContain('Expires:            2026-12-31')
        expect(output).toContain('$6/mo')
        expect(output).toContain('https://billing.stripe.com/portal/abc')
        consoleSpy.mockRestore()
    })

    it('outputs the raw payload with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getSubscriptionInfo.mockResolvedValue(fixtures.billing.subscription)

        await program.parseAsync(['node', 'td', 'billing', 'subscription', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(JSON.parse(output)).toEqual(fixtures.billing.subscription)
        consoleSpy.mockRestore()
    })

    it('outputs single-line JSON with --ndjson', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getSubscriptionInfo.mockResolvedValue(fixtures.billing.subscription)

        await program.parseAsync(['node', 'td', 'billing', 'subscription', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).not.toContain('\n')
        expect(JSON.parse(output)).toEqual(fixtures.billing.subscription)
        consoleSpy.mockRestore()
    })

    it('renders a free plan with no price gracefully', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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
        consoleSpy.mockRestore()
    })
})

describe('billing plan', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('renders pro plan details', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getProPlanDetails.mockResolvedValue(fixtures.billing.proPlanDetails)

        await program.parseAsync(['node', 'td', 'billing', 'plan'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Status:             Active')
        expect(output).toContain('Downgrade at:       (none)')
        expect(output).toContain('monthly: $6')
        consoleSpy.mockRestore()
    })

    it('outputs the raw payload with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getProPlanDetails.mockResolvedValue(fixtures.billing.proPlanDetails)

        await program.parseAsync(['node', 'td', 'billing', 'plan', '--json'])

        expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual(
            fixtures.billing.proPlanDetails,
        )
        consoleSpy.mockRestore()
    })
})

describe('billing prices', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('renders pro and teams price listings', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getPrices.mockResolvedValue(fixtures.billing.prices)

        await program.parseAsync(['node', 'td', 'billing', 'prices'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Pro')
        expect(output).toContain('yearly: $60')
        expect(output).toContain('Teams')
        expect(output).toContain('monthly: $8')
        consoleSpy.mockRestore()
    })
})

describe('billing pricing', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('formats minor-unit numbers as money and lists version entries', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getPricing.mockResolvedValue(fixtures.billing.pricing)

        await program.parseAsync(['node', 'td', 'billing', 'pricing'])

        expect(mockApi.getPricing).toHaveBeenCalledWith({ formatted: undefined })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Latest Pro:         v25')
        expect(output).toContain('v25')
        expect(output).toContain('pro (USD): $4/mo, $29/yr')
        consoleSpy.mockRestore()
    })

    it('passes --formatted through and prints pre-formatted strings as-is', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getPricing.mockResolvedValue(fixtures.billing.pricingFormatted)

        await program.parseAsync(['node', 'td', 'billing', 'pricing', '--formatted'])

        expect(mockApi.getPricing).toHaveBeenCalledWith({ formatted: true })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('pro (USD): $4/mo, $29/yr')
        consoleSpy.mockRestore()
    })
})

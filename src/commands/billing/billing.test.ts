import { TodoistRequestError } from '@doist/todoist-sdk'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/api/core.js')>()
    return {
        ...actual,
        getApi: vi.fn(),
    }
})

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        getAuthMetadata: vi.fn(),
    }
})

import { getApi, wrapApiError } from '../../lib/api/core.js'
import { getAuthMetadata } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import { registerBillingCommand } from './index.js'

const mockGetApi = vi.mocked(getApi)
const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerBillingCommand(program)
    return program
}

const SUBSCRIPTION = {
    status: 'autorenew',
    plan: 'pro',
    expirationDate: '2026-12-31',
    activationMethod: 'stripe',
    planPrice: {
        amount: '600',
        rawAmount: 600,
        currency: 'USD',
        billingCycle: 'monthly',
        taxBehavior: 'exclusive',
    },
    billingPortalUrl: 'https://billing.stripe.com/portal/abc',
    billingPortalSwitchToAnnualUrl: null,
    hasBillingPortal: true,
    hasBillingPortalSwitchToAnnual: false,
    invoiceCreditBalance: { usd: 0 },
    hasSwitchLegacyToCurrent: false,
}

const PRO_PLAN_DETAILS = {
    currentPlanStatus: 'Active',
    downgradeAt: null,
    priceList: [
        {
            billingCycle: 'monthly',
            prices: [{ currency: 'USD', unitAmount: 600, taxBehavior: 'exclusive' }],
        },
    ],
}

const PRICES = {
    pro: [
        {
            billingCycle: 'yearly',
            prices: [{ currency: 'USD', unitAmount: 6000, taxBehavior: 'exclusive' }],
        },
    ],
    teams: [
        {
            billingCycle: 'monthly',
            prices: [{ currency: 'USD', unitAmount: 800, taxBehavior: 'inclusive' }],
        },
    ],
}

const PRICING = {
    latestPro: 'v25',
    latestBiz: 'v25',
    sessionPro: 'v25',
    sessionBiz: 'v25',
    v25: {
        pro: { usd: { monthly: 400, yearly: 2900 } },
        biz: { usd: { monthly: 800, yearly: 7200 } },
    },
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
        mockApi.getSubscriptionInfo.mockResolvedValue(SUBSCRIPTION)

        // No subcommand given → default subscription
        await program.parseAsync(['node', 'td', 'billing'])

        expect(mockApi.getSubscriptionInfo).toHaveBeenCalledTimes(1)
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Plan:               pro')
        expect(output).toContain('Status:             autorenew')
        expect(output).toContain('Activation:         stripe')
        expect(output).toContain('Expires:            2026-12-31')
        expect(output).toContain('$6.00/mo')
        expect(output).toContain('https://billing.stripe.com/portal/abc')
        consoleSpy.mockRestore()
    })

    it('outputs the raw payload with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getSubscriptionInfo.mockResolvedValue(SUBSCRIPTION)

        await program.parseAsync(['node', 'td', 'billing', 'subscription', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(JSON.parse(output)).toEqual(SUBSCRIPTION)
        consoleSpy.mockRestore()
    })

    it('outputs single-line JSON with --ndjson', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getSubscriptionInfo.mockResolvedValue(SUBSCRIPTION)

        await program.parseAsync(['node', 'td', 'billing', 'subscription', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).not.toContain('\n')
        expect(JSON.parse(output)).toEqual(SUBSCRIPTION)
        consoleSpy.mockRestore()
    })

    it('renders a free plan with no price gracefully', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getSubscriptionInfo.mockResolvedValue({
            ...SUBSCRIPTION,
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
        mockApi.getProPlanDetails.mockResolvedValue(PRO_PLAN_DETAILS)

        await program.parseAsync(['node', 'td', 'billing', 'plan'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Status:             Active')
        expect(output).toContain('Downgrade at:       (none)')
        expect(output).toContain('monthly: $6.00')
        consoleSpy.mockRestore()
    })

    it('outputs the raw payload with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getProPlanDetails.mockResolvedValue(PRO_PLAN_DETAILS)

        await program.parseAsync(['node', 'td', 'billing', 'plan', '--json'])

        expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual(PRO_PLAN_DETAILS)
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
        mockApi.getPrices.mockResolvedValue(PRICES)

        await program.parseAsync(['node', 'td', 'billing', 'prices'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Pro')
        expect(output).toContain('yearly: $60.00')
        expect(output).toContain('Teams')
        expect(output).toContain('monthly: $8.00')
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
        mockApi.getPricing.mockResolvedValue(PRICING)

        await program.parseAsync(['node', 'td', 'billing', 'pricing'])

        expect(mockApi.getPricing).toHaveBeenCalledWith({ formatted: undefined })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Latest Pro:         v25')
        expect(output).toContain('v25')
        expect(output).toContain('pro (USD): $4.00/mo, $29.00/yr')
        consoleSpy.mockRestore()
    })

    it('passes --formatted through and prints pre-formatted strings as-is', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockApi.getPricing.mockResolvedValue({
            latestPro: 'v25',
            latestBiz: 'v25',
            sessionPro: 'v25',
            sessionBiz: 'v25',
            v25: { pro: { usd: { monthly: '$4', yearly: '$29' } } },
        })

        await program.parseAsync(['node', 'td', 'billing', 'pricing', '--formatted'])

        expect(mockApi.getPricing).toHaveBeenCalledWith({ formatted: true })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('pro (USD): $4/mo, $29/yr')
        consoleSpy.mockRestore()
    })
})

describe('billing wrapApiError → MISSING_SCOPE', () => {
    function scopeError() {
        return new TodoistRequestError('HTTP 403: Forbidden', 403, {
            error: 'Insufficient Token scope',
            error_tag: 'AUTH_INSUFFICIENT_TOKEN_SCOPE',
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAuthMetadata.mockResolvedValue({ authMode: 'read-write', source: 'secure-store' })
    })

    it('emits the billing hint (read_write scope) for billing read methods', async () => {
        for (const method of [
            'getSubscriptionInfo',
            'getProPlanDetails',
            'getPrices',
            'getPricing',
        ]) {
            const wrapped = (await wrapApiError(scopeError(), method)) as CliError
            expect(wrapped.code).toBe('MISSING_SCOPE')
            expect(wrapped.hints?.[0]).toContain('--additional-scopes=billing')
            expect(wrapped.hints?.[0]).toContain('billing:read_write')
        }
    })

    it('names billing:read and preserves --read-only for a read-only login', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authFlags: ['read-only'],
            source: 'secure-store',
        })
        const wrapped = (await wrapApiError(scopeError(), 'getSubscriptionInfo')) as CliError
        expect(wrapped.hints?.[0]).toContain('--read-only --additional-scopes=billing')
        expect(wrapped.hints?.[0]).toContain('billing:read')
        expect(wrapped.hints?.[0]).not.toContain('billing:read_write')
    })
})

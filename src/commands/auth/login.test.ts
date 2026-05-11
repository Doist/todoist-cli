import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        upsertUser: vi.fn(),
        clearApiToken: vi.fn(),
        loadTokenForStoredUser: vi.fn(),
    }
})

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
    createApiForToken: vi.fn(),
}))

vi.mock('chalk')

// Capture (but don't execute) the options handed to cli-core's
// `attachLoginCommand`. Tests then invoke `resolveScopes` / `onSuccess`
// directly so the local mapping logic — which cli-core's own tests can't
// see — stays covered.
const capturedAttachOptions: Array<{
    options: Record<string, unknown>
}> = []

vi.mock('@doist/cli-core/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
    return {
        ...actual,
        attachLoginCommand: vi.fn(
            (parent: { command: (name: string) => Command }, options: Record<string, unknown>) => {
                capturedAttachOptions.push({ options })
                return parent.command('login')
            },
        ),
    }
})

import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { attachTodoistLoginCommand } from './login.js'

function lastAttachOptions() {
    if (capturedAttachOptions.length === 0) {
        throw new Error('attachLoginCommand was not invoked')
    }
    return capturedAttachOptions[capturedAttachOptions.length - 1].options as {
        resolveScopes: (ctx: { readOnly: boolean; flags: Record<string, unknown> }) => string[]
        onSuccess: (ctx: {
            account: { id: string; label?: string }
            view: { json: boolean; ndjson: boolean }
            flags: Record<string, unknown>
        }) => void | Promise<void>
    }
}

function attachAndCapture(): ReturnType<typeof lastAttachOptions> {
    capturedAttachOptions.length = 0
    const program = new Command()
    program.exitOverride()
    attachTodoistLoginCommand(program)
    return lastAttachOptions()
}

describe('attachTodoistLoginCommand: resolveScopes', () => {
    afterEach(() => {
        capturedAttachOptions.length = 0
    })

    it('returns the read-write base scope set when nothing is overridden', () => {
        const opts = attachAndCapture()
        expect(opts.resolveScopes({ readOnly: false, flags: {} })).toEqual([
            'data:read_write',
            'data:delete',
            'project:delete',
        ])
    })

    it('swaps the base grant to read-only', () => {
        const opts = attachAndCapture()
        expect(opts.resolveScopes({ readOnly: true, flags: {} })).toEqual(['data:read'])
    })

    it('layers --additional-scopes onto the base grant in canonical order', () => {
        const opts = attachAndCapture()
        expect(
            opts.resolveScopes({
                readOnly: false,
                flags: { additionalScopes: 'backups,app-management' },
            }),
        ).toEqual([
            'data:read_write',
            'data:delete',
            'project:delete',
            'dev:app_console',
            'backups:read',
        ])
    })

    it('combines --read-only with --additional-scopes', () => {
        const opts = attachAndCapture()
        expect(
            opts.resolveScopes({
                readOnly: true,
                flags: { additionalScopes: 'backups' },
            }),
        ).toEqual(['data:read', 'backups:read'])
    })

    it('rejects unknown additional scopes', () => {
        const opts = attachAndCapture()
        expect(() =>
            opts.resolveScopes({
                readOnly: false,
                flags: { additionalScopes: 'not-a-scope' },
            }),
        ).toThrowError(/Unknown scope/)
    })
})

describe('attachTodoistLoginCommand: onSuccess output formatting', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
        capturedAttachOptions.length = 0
    })

    const ACCOUNT = {
        id: '12345',
        email: 'you@example.com',
        label: 'you@example.com',
        auth_mode: 'read-write' as const,
        auth_scope: 'data:read_write,data:delete,project:delete',
        auth_flags: undefined,
    }

    it('prints the human "Signed in" confirmation in plain mode', async () => {
        const opts = attachAndCapture()

        await opts.onSuccess({
            account: ACCOUNT,
            view: { json: false, ndjson: false },
            flags: {},
        })

        const printed = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
        expect(printed).toContain('Signed in to Todoist as')
        expect(printed).toContain('you@example.com')
    })

    it('emits a JSON envelope in --json mode', async () => {
        const opts = attachAndCapture()

        await opts.onSuccess({
            account: ACCOUNT,
            view: { json: true, ndjson: false },
            flags: {},
        })

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed).toMatchObject({
            displayName: 'Todoist',
            account: { id: ACCOUNT.id, email: ACCOUNT.email },
        })
    })

    it('emits an NDJSON line in --ndjson mode', async () => {
        const opts = attachAndCapture()

        await opts.onSuccess({
            account: ACCOUNT,
            view: { json: false, ndjson: true },
            flags: {},
        })

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const line = (consoleSpy.mock.calls[0][0] as string).trim()
        // Single NDJSON line — no trailing newlines, parses as a JSON object.
        const parsed = JSON.parse(line)
        expect(parsed).toMatchObject({ displayName: 'Todoist', account: { id: ACCOUNT.id } })
    })
})

describe('attachTodoistLoginCommand: storage warning surfacing', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
        capturedAttachOptions.length = 0
    })

    const ACCOUNT = {
        id: '12345',
        email: 'you@example.com',
        label: 'you@example.com',
        auth_mode: 'read-write' as const,
    }

    it('surfaces a keyring-fallback warning written by the token store', async () => {
        // Drive a real store + simulate `upsertUser` returning the fallback
        // warning; the login command should read it via getLastStorageResult
        // and log it to stderr — without that wiring, this PR silently
        // wrote plaintext tokens.
        const { upsertUser } = await import('../../lib/auth.js')
        vi.mocked(upsertUser).mockResolvedValue({
            storage: 'config-file',
            replaced: false,
            warning:
                'system credential manager unavailable; token saved as plaintext in /tmp/c.json',
        })

        const store = createTodoistTokenStore()
        await store.set(ACCOUNT, 'token_xyz123456')

        const opts = attachAndCapture()
        // Manually splice in the freshly-set store so onSuccess pulls from it.
        // (`attachAndCapture` builds its own internal store; we exercise the
        // surfacing path by simulating the same shape.)
        const captured = capturedAttachOptions[capturedAttachOptions.length - 1].options as {
            store: { getLastStorageResult: () => unknown }
        }
        captured.store.getLastStorageResult = () => ({
            storage: 'config-file',
            warning:
                'system credential manager unavailable; token saved as plaintext in /tmp/c.json',
        })

        await opts.onSuccess({
            account: ACCOUNT,
            view: { json: false, ndjson: false },
            flags: {},
        })

        expect(errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')).toContain(
            'system credential manager unavailable',
        )
    })

    it('still surfaces warnings in --json mode (to stderr, leaving stdout clean)', async () => {
        const opts = attachAndCapture()
        const captured = capturedAttachOptions[capturedAttachOptions.length - 1].options as {
            store: { getLastStorageResult: () => unknown }
        }
        captured.store.getLastStorageResult = () => ({
            storage: 'config-file',
            warning:
                'system credential manager unavailable; token saved as plaintext in /tmp/c.json',
        })

        await opts.onSuccess({
            account: ACCOUNT,
            view: { json: true, ndjson: false },
            flags: {},
        })

        // stdout has only the JSON envelope
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(() => JSON.parse(consoleSpy.mock.calls[0][0] as string)).not.toThrow()
        // stderr carries the warning
        expect(errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')).toContain(
            'system credential manager unavailable',
        )
    })
})

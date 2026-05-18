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
// `attachLoginCommand` so tests can invoke the Todoist-local callbacks
// (`resolveScopes`, `onSuccess`) directly — cli-core's own tests don't cover
// the mapping logic, so the local glue would otherwise go unverified.
const capturedAttachOptions: Array<{ options: Record<string, unknown> }> = []

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

type AttachOptions = {
    resolveScopes: (ctx: { readOnly: boolean; flags: Record<string, unknown> }) => string[]
    onSuccess: (ctx: {
        account: { id: string; label?: string }
        view: { json: boolean; ndjson: boolean }
        flags: Record<string, unknown>
    }) => void | Promise<void>
    store: { getLastStorageResult: () => unknown }
}

function attachAndCapture(): AttachOptions {
    capturedAttachOptions.length = 0
    const program = new Command()
    program.exitOverride()
    attachTodoistLoginCommand(program, createTodoistTokenStore())
    return capturedAttachOptions[capturedAttachOptions.length - 1].options as AttachOptions
}

const ACCOUNT = {
    id: '12345',
    email: 'you@example.com',
    label: 'you@example.com',
    auth_mode: 'read-write' as const,
    auth_scope: 'data:read_write,data:delete,project:delete',
    auth_flags: undefined,
}

describe('attachTodoistLoginCommand: resolveScopes callback', () => {
    afterEach(() => {
        capturedAttachOptions.length = 0
    })

    it('returns the read-write base scope set when nothing is overridden', () => {
        expect(attachAndCapture().resolveScopes({ readOnly: false, flags: {} })).toEqual([
            'data:read_write',
            'data:delete',
            'project:delete',
        ])
    })

    it('combines --read-only with --additional-scopes in canonical order', () => {
        expect(
            attachAndCapture().resolveScopes({
                readOnly: true,
                flags: { additionalScopes: 'backups,app-management' },
            }),
        ).toEqual(['data:read', 'dev:app_console', 'backups:read'])
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

    it('prints the human "Signed in" confirmation in plain mode', async () => {
        const opts = attachAndCapture()
        await opts.onSuccess({ account: ACCOUNT, view: { json: false, ndjson: false }, flags: {} })

        const printed = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
        expect(printed).toContain('Signed in to Todoist as')
        expect(printed).toContain('you@example.com')
    })

    it.each([
        ['--json', { json: true, ndjson: false }],
        ['--ndjson', { json: false, ndjson: true }],
    ])('emits a machine-output envelope in %s mode', async (_label, view) => {
        const opts = attachAndCapture()
        await opts.onSuccess({ account: ACCOUNT, view, flags: {} })

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const parsed = JSON.parse((consoleSpy.mock.calls[0][0] as string).trim())
        expect(parsed).toMatchObject({
            displayName: 'Todoist',
            account: { id: ACCOUNT.id, email: ACCOUNT.email },
        })
    })

    it('surfaces keyring-fallback warnings via stderr, keeping --json stdout clean', async () => {
        const opts = attachAndCapture()
        const warning =
            'system credential manager unavailable; token saved as plaintext in /tmp/c.json'
        opts.store.getLastStorageResult = () => ({ storage: 'config-file', warning })

        await opts.onSuccess({ account: ACCOUNT, view: { json: true, ndjson: false }, flags: {} })

        // stdout carries only the JSON envelope; warning lands on stderr so it
        // doesn't break consumers piping the output into `jq`.
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(() => JSON.parse(consoleSpy.mock.calls[0][0] as string)).not.toThrow()
        expect(errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')).toContain(warning)
    })
})

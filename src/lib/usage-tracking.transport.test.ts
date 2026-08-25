import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { initializeLogger, resetLogger } from './logger.js'
import { createTrackedFetch, fetchTodoist } from './usage-tracking.js'

// Deliberately no `vi.mock('@doist/todoist-sdk')` in this file, unlike its
// sibling `usage-tracking.test.ts`. This exercises the REAL transport — the
// SDK's proxy agent, its decompress interceptor and undici's own fetch —
// against a real local server.
//
// It exists because every other test in the CLI stubs fetch, which means none
// of them can see a mismatch between the dispatcher and the fetch it is used
// with. That mismatch corrupts every compressed response on Node 26 while
// leaving a stubbed suite entirely green.

const PAYLOAD = {
    results: Array.from({ length: 200 }, (_, index) => ({
        id: `task-${index}`,
        content: `Task number ${index} with enough text to push the body past a single chunk`,
    })),
}

const ENCODERS = {
    gzip: gzipSync,
    deflate: deflateSync,
    br: brotliCompressSync,
} as const

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03])

let server: Server
let baseUrl: string
let lastRequestHeaders: Record<string, string | string[] | undefined> = {}

beforeAll(async () => {
    // `EnvHttpProxyAgent` reads the proxy environment at construction and the
    // SDK caches the transport for the life of the process, so this has to
    // happen before the first request in this file.
    for (const name of [
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'http_proxy',
        'https_proxy',
        'all_proxy',
    ]) {
        vi.stubEnv(name, undefined)
    }

    server = createServer((request, response) => {
        lastRequestHeaders = request.headers

        const url = new URL(request.url ?? '/', 'http://localhost')

        if (url.pathname === '/binary') {
            const body = gzipSync(PNG_BYTES)
            response.writeHead(200, {
                'content-type': 'image/png',
                'content-encoding': 'gzip',
                'content-length': String(body.length),
            })
            response.end(body)
            return
        }

        const encoding = url.searchParams.get('encoding') as keyof typeof ENCODERS | null
        const raw = Buffer.from(JSON.stringify(PAYLOAD))
        const body = encoding ? ENCODERS[encoding](raw) : raw
        response.writeHead(200, {
            'content-type': 'application/json',
            ...(encoding ? { 'content-encoding': encoding } : {}),
            'content-length': String(body.length),
        })
        response.end(body)
    })

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
    // `restoreMocks` does not undo `vi.stubEnv`, so without this the worker
    // keeps the cleared proxy variables for every test file that follows.
    vi.unstubAllEnvs()
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
        server.close(() => resolve())
    })
})

describe('usage tracking over the real transport', () => {
    it.each(Object.keys(ENCODERS))('decodes a %s-encoded response body', async (encoding) => {
        const response = await createTrackedFetch()(`${baseUrl}/json?encoding=${encoding}`, {
            method: 'GET',
        })

        expect(response.status).toBe(200)
        // A dispatcher paired with the wrong fetch decompresses the body twice
        // and this rejects with `TypeError: terminated`.
        expect(await response.json()).toEqual(PAYLOAD)
    })

    it('decodes a compressed response through fetchTodoist', async () => {
        // The OAuth token exchange and the postinstall user fetch take this
        // path rather than going through TodoistApi.
        const response = await fetchTodoist(`${baseUrl}/json?encoding=gzip`)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(PAYLOAD)
    })

    it('reads a compressed binary body back byte for byte', async () => {
        const response = await createTrackedFetch()(`${baseUrl}/binary`, { method: 'GET' })
        // `arrayBuffer` is optional on the SDK's custom fetch response type,
        // but the CLI always supplies it — this is what `viewAttachment` uses.
        if (!response.arrayBuffer) throw new Error('expected an arrayBuffer reader')
        const bytes = Buffer.from(await response.arrayBuffer())

        expect(bytes.equals(PNG_BYTES)).toBe(true)
    })

    it('still sends the usage tracking headers', async () => {
        await createTrackedFetch()(`${baseUrl}/json`, { method: 'GET' })

        expect(lastRequestHeaders['user-agent']).toMatch(/^todoist-cli\//)
        expect(lastRequestHeaders['request-id']).toBeTruthy()
        expect(lastRequestHeaders['session-id']).toBeTruthy()
    })

    it('still logs API traffic when verbose is on', async () => {
        // The regression this guards: API requests go through the fetch paired
        // with the dispatcher, never `globalThis.fetch`, so the global patch in
        // `initializeLogger` cannot see them. Drop the `withHttpLogging` wrap in
        // `resolveRequestFetch` and `td --verbose` goes silent for every call.
        const originalGlobalFetch = globalThis.fetch
        const written: string[] = []
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((
            chunk: string | Uint8Array,
        ) => {
            written.push(String(chunk))
            return true
        }) as typeof process.stderr.write)

        try {
            vi.stubEnv('TD_VERBOSE', '1')
            resetLogger()
            initializeLogger()
            // Undo the global patch, so a log line can only have come from the
            // wrapper applied to the paired fetch.
            globalThis.fetch = originalGlobalFetch

            const response = await createTrackedFetch()(`${baseUrl}/json?encoding=gzip`, {
                method: 'GET',
            })

            expect(await response.json()).toEqual(PAYLOAD)
            expect(written.join('')).toMatch(/fetch GET \/json/)
            expect(written.join('')).toMatch(/=> 200/)
        } finally {
            globalThis.fetch = originalGlobalFetch
            stderrSpy.mockRestore()
            vi.stubEnv('TD_VERBOSE', '')
            resetLogger()
        }
    })
})

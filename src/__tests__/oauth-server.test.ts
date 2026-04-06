import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { getRedirectUri, startCallbackServer } from '../lib/oauth-server.js'

describe('getRedirectUri', () => {
    it('builds redirect URI from port', () => {
        expect(getRedirectUri(8765)).toBe('http://localhost:8765/callback')
        expect(getRedirectUri(8767)).toBe('http://localhost:8767/callback')
    })
})

describe('startCallbackServer', { sequential: true }, () => {
    const cleanups: (() => void)[] = []

    afterEach(async () => {
        for (const cleanup of cleanups) {
            cleanup()
        }
        cleanups.length = 0
        // Allow sockets to fully close
        await new Promise((resolve) => setTimeout(resolve, 50))
    })

    it('binds to the default port when available', async () => {
        const { port, cleanup } = await startCallbackServer('test-state')
        cleanups.push(cleanup)

        expect(port).toBe(8765)
    })

    it('falls back to the next port when default is in use', async () => {
        const blocker = createServer()
        await new Promise<void>((resolve) => blocker.listen(8765, resolve))
        cleanups.push(() => blocker.close())

        const { port, cleanup } = await startCallbackServer('test-state')
        cleanups.push(cleanup)

        expect(port).toBe(8766)
    })

    it('skips multiple occupied ports', async () => {
        for (const p of [8765, 8766, 8767]) {
            const s = createServer()
            await new Promise<void>((resolve) => s.listen(p, resolve))
            cleanups.push(() => s.close())
        }

        const { port, cleanup } = await startCallbackServer('test-state')
        cleanups.push(cleanup)

        expect(port).toBe(8768)
    })
})

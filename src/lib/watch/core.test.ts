import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
    Backoff,
    BoundedMap,
    createWatchEvent,
    sanitizeInline,
    stableStringify,
    StateDeduper,
    StreamWriter,
    truncateInline,
} from './core.js'

describe('createWatchEvent', () => {
    it('builds the v1 envelope for a resource change', () => {
        const event = createWatchEvent({
            source: 'todoist',
            accountId: 'user-1',
            resourceType: 'task',
            changeType: 'changed',
            resourceId: 'task-1',
            data: { id: 'task-1' },
        })
        expect(event.schemaVersion).toBe(1)
        expect(event.source).toBe('todoist')
        expect(event.accountId).toBe('user-1')
        expect(event.eventType).toBe('task.changed')
        expect(event.resourceType).toBe('task')
        expect(event.changeType).toBe('changed')
        expect(event.resourceId).toBe('task-1')
        expect(event.eventId).toBeTruthy()
        expect(new Date(event.detectedAt).getTime()).not.toBeNaN()
    })

    it('uses stream.reset for reset events', () => {
        const event = createWatchEvent({
            source: 'todoist',
            accountId: 'user-1',
            resourceType: null,
            changeType: 'reset',
            resourceId: null,
            data: { reason: 'x' },
        })
        expect(event.eventType).toBe('stream.reset')
        expect(event.resourceType).toBeNull()
        expect(event.resourceId).toBeNull()
    })
})

describe('stableStringify', () => {
    it('is insensitive to key order and serializes dates', () => {
        const date = new Date('2026-08-30T10:00:00Z')
        const a = stableStringify({ b: 1, a: [{ y: date, x: null }] })
        const b = stableStringify({ a: [{ x: null, y: new Date(date) }], b: 1 })
        expect(a).toBe(b)
    })

    it('distinguishes different values', () => {
        expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }))
    })
})

describe('StateDeduper', () => {
    it('suppresses unchanged states and passes real changes', () => {
        const deduper = new StateDeduper()
        expect(deduper.observe('task:1', { content: 'a' })).toBe(true)
        expect(deduper.observe('task:1', { content: 'a' })).toBe(false)
        expect(deduper.observe('task:1', { content: 'b' })).toBe(true)
        expect(deduper.observe('task:2', { content: 'a' })).toBe(true)
    })

    it('bounds memory by evicting the least recently used key', () => {
        const deduper = new StateDeduper(2)
        deduper.observe('a', 1)
        deduper.observe('b', 1)
        deduper.observe('c', 1) // evicts 'a'
        expect(deduper.observe('a', 1)).toBe(true)
    })
})

describe('BoundedMap', () => {
    it('evicts the oldest entry once full, refreshing on access', () => {
        const map = new BoundedMap<string, number>(2)
        map.set('a', 1)
        map.set('b', 2)
        map.get('a') // refresh 'a'
        map.set('c', 3) // evicts 'b'
        expect(map.has('a')).toBe(true)
        expect(map.has('b')).toBe(false)
        expect(map.has('c')).toBe(true)
    })
})

describe('Backoff', () => {
    it('grows exponentially up to the cap and resets', () => {
        const backoff = new Backoff({ initialMs: 100, maxMs: 300, factor: 2, jitter: 0 })
        expect(backoff.nextDelayMs()).toBe(100)
        expect(backoff.nextDelayMs()).toBe(200)
        expect(backoff.nextDelayMs()).toBe(300)
        expect(backoff.nextDelayMs()).toBe(300)
        backoff.reset()
        expect(backoff.nextDelayMs()).toBe(100)
    })
})

describe('sanitizeInline', () => {
    it('strips terminal control characters and escape sequences', () => {
        expect(sanitizeInline('safe \u001b[31mred\u001b[0m \u0007bell')).toBe(
            'safe [31mred[0m bell',
        )
    })

    it('collapses newlines and tabs into spaces', () => {
        expect(sanitizeInline('line one\nline two\ttabbed\r\n')).toBe('line one line two tabbed ')
    })

    it('removes direction-override characters but keeps emoji joiners', () => {
        expect(sanitizeInline('a\u202eb')).toBe('ab')
        expect(sanitizeInline('👩\u200d👩\u200d👧')).toBe('👩\u200d👩\u200d👧')
    })
})

describe('truncateInline', () => {
    it('truncates long values with an ellipsis', () => {
        const result = truncateInline('x'.repeat(300), 10)
        expect(result).toHaveLength(10)
        expect(result.endsWith('…')).toBe(true)
    })
})

describe('StreamWriter', () => {
    it('writes chunks to the stream', async () => {
        const stream = new PassThrough()
        const writer = new StreamWriter(stream, () => {})
        await writer.write('hello\n')
        expect(stream.read()?.toString()).toBe('hello\n')
    })

    it('reports an unwritable stream instead of crashing', async () => {
        const stream = new PassThrough()
        const onUnwritable = vi.fn()
        const writer = new StreamWriter(stream, onUnwritable)
        stream.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
        await writer.write('data')
        expect(onUnwritable).toHaveBeenCalled()
        expect(writer.isWritable).toBe(false)
    })

    it('waits for drain when the stream applies backpressure', async () => {
        const stream = new PassThrough({ highWaterMark: 4 })
        const writer = new StreamWriter(stream, () => {})
        const pending = writer.write('over the high water mark')
        let resolved = false
        void pending.then(() => {
            resolved = true
        })
        await new Promise((resolve) => setImmediate(resolve))
        expect(resolved).toBe(false)
        stream.read() // consume, triggering drain
        await pending
    })
})

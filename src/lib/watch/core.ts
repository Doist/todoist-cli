/**
 * Product-agnostic building blocks for `watch`-style streaming commands.
 *
 * Nothing in this module knows about Todoist: the event envelope, duplicate
 * suppression, reconnect backoff, terminal-safe text handling, and the
 * backpressure-aware stream writer could back a watch command in any Doist
 * CLI. Todoist-specific behavior lives in `todoist.ts`.
 */

import { randomUUID } from 'node:crypto'

export const WATCH_SCHEMA_VERSION = 1

export type WatchChangeType = 'changed' | 'deleted' | 'reset'

/** One event on a watch stream. In NDJSON mode this is emitted verbatim. */
export interface WatchEvent {
    schemaVersion: typeof WATCH_SCHEMA_VERSION
    eventId: string
    source: string
    accountId: string
    /** `<resource>.changed`, `<resource>.deleted`, or `stream.reset`. */
    eventType: string
    resourceType: string | null
    changeType: WatchChangeType
    resourceId: string | null
    detectedAt: string
    data: unknown
}

export interface WatchEventInit {
    source: string
    accountId: string
    resourceType: string | null
    changeType: WatchChangeType
    resourceId: string | null
    data: unknown
}

export function createWatchEvent(init: WatchEventInit): WatchEvent {
    return {
        schemaVersion: WATCH_SCHEMA_VERSION,
        eventId: randomUUID(),
        source: init.source,
        accountId: init.accountId,
        eventType:
            init.changeType === 'reset'
                ? 'stream.reset'
                : `${init.resourceType}.${init.changeType}`,
        resourceType: init.resourceType,
        changeType: init.changeType,
        resourceId: init.resourceId,
        detectedAt: new Date().toISOString(),
        data: init.data,
    }
}

/**
 * Map with a maximum entry count and least-recently-used eviction. Keeps
 * per-invocation caches (dedup fingerprints, relationship lookups) memory
 * bounded on long-running watches.
 */
export class BoundedMap<K, V> {
    private readonly map = new Map<K, V>()

    constructor(private readonly maxEntries: number) {}

    get size(): number {
        return this.map.size
    }

    has(key: K): boolean {
        return this.map.has(key)
    }

    get(key: K): V | undefined {
        if (!this.map.has(key)) return undefined
        const value = this.map.get(key) as V
        this.map.delete(key)
        this.map.set(key, value)
        return value
    }

    set(key: K, value: V): void {
        if (this.map.has(key)) {
            this.map.delete(key)
        } else if (this.map.size >= this.maxEntries) {
            const oldest = this.map.keys().next()
            if (!oldest.done) this.map.delete(oldest.value)
        }
        this.map.set(key, value)
    }
}

/** JSON.stringify with object keys sorted at every depth, so two structurally
 * equal payloads always produce the same fingerprint. */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
    if (value instanceof Date) return JSON.stringify(value.toISOString())
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
}

/**
 * Suppresses events for resource states already observed. `observe` returns
 * true when the state is new (or changed since last seen) for that key.
 */
export class StateDeduper {
    private readonly fingerprints: BoundedMap<string, string>

    constructor(maxEntries = 5000) {
        this.fingerprints = new BoundedMap(maxEntries)
    }

    observe(key: string, data: unknown): boolean {
        const fingerprint = stableStringify(data)
        if (this.fingerprints.get(key) === fingerprint) return false
        this.fingerprints.set(key, fingerprint)
        return true
    }
}

export interface BackoffOptions {
    initialMs?: number
    maxMs?: number
    factor?: number
    /** Fraction of the delay used as random jitter (0 disables). */
    jitter?: number
}

/** Exponential backoff with jitter for reconnects and sync retries. */
export class Backoff {
    private attempt = 0
    private readonly initialMs: number
    private readonly maxMs: number
    private readonly factor: number
    private readonly jitter: number

    constructor(options: BackoffOptions = {}) {
        this.initialMs = options.initialMs ?? 1000
        this.maxMs = options.maxMs ?? 30_000
        this.factor = options.factor ?? 2
        this.jitter = options.jitter ?? 0.2
    }

    nextDelayMs(): number {
        const base = Math.min(this.maxMs, this.initialMs * this.factor ** this.attempt)
        this.attempt++
        const spread = base * this.jitter
        return Math.round(base - spread + Math.random() * spread * 2)
    }

    reset(): void {
        this.attempt = 0
    }
}

/**
 * Make untrusted text safe for a single terminal line: control characters
 * (including escape sequences), line breaks, and invisible direction-override
 * characters are removed so remote content cannot corrupt terminal output.
 * U+200D (zero-width joiner) is kept so emoji sequences render intact.
 */
export function sanitizeInline(text: string): string {
    return text.replace(/[\r\n\t\v\f]+/g, ' ').replace(/(?!\u200d)[\p{Cc}\p{Cf}]/gu, '')
}

export function truncateInline(text: string, maxLength = 200): string {
    const clean = sanitizeInline(text)
    if (clean.length <= maxLength) return clean
    return `${clean.slice(0, maxLength - 1)}…`
}

/**
 * Writes to an output stream while respecting backpressure, and reports when
 * the stream can no longer accept output (e.g. the consumer of a pipe went
 * away) instead of crashing on EPIPE.
 */
export class StreamWriter {
    private failed = false

    constructor(
        private readonly stream: NodeJS.WritableStream,
        private readonly onUnwritable: () => void,
    ) {
        stream.on('error', () => {
            this.failed = true
            this.onUnwritable()
        })
    }

    get isWritable(): boolean {
        return !this.failed && this.stream.writable !== false
    }

    async write(chunk: string): Promise<void> {
        if (!this.isWritable) {
            this.onUnwritable()
            return
        }
        const flushed = this.stream.write(chunk)
        if (flushed) return
        await new Promise<void>((resolve) => {
            const done = () => {
                this.stream.off('drain', done)
                this.stream.off('error', done)
                this.stream.off('close', done)
                resolve()
            }
            this.stream.on('drain', done)
            this.stream.on('error', done)
            this.stream.on('close', done)
        })
    }
}

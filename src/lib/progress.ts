import fs from 'node:fs'
import { getProgressJsonlPath } from './global-args.js'

export type ProgressEvent = {
    type: 'start' | 'api_call' | 'api_response' | 'complete' | 'error'
    timestamp: string
    command?: string
    endpoint?: string
    cursor?: string | null
    count?: number
    has_more?: boolean
    next_cursor?: string | null
    error_code?: string
    message?: string
}

export class ProgressTracker {
    private enabled = false
    private outputStream: fs.WriteStream | typeof process.stderr | null = null

    constructor() {
        this.checkAndInitialize()
    }

    private checkAndInitialize() {
        const progressJsonl = getProgressJsonlPath()
        if (progressJsonl === false) return

        this.enabled = true

        if (typeof progressJsonl === 'string') {
            try {
                this.outputStream = fs.createWriteStream(progressJsonl, { flags: 'a' })
            } catch (_error) {
                console.error(
                    `Warning: Could not create progress file ${progressJsonl}, falling back to stderr`,
                )
                this.outputStream = process.stderr
            }
        } else {
            this.outputStream = process.stderr
        }
    }

    isEnabled(): boolean {
        return this.enabled
    }

    emit(event: Omit<ProgressEvent, 'timestamp'>): void {
        if (!this.enabled || !this.outputStream) {
            return
        }

        const progressEvent: ProgressEvent = {
            ...event,
            timestamp: new Date().toISOString(),
        }

        const line = `${JSON.stringify(progressEvent)}\n`
        this.outputStream.write(line)
    }

    emitStart(command: string): void {
        this.emit({ type: 'start', command })
    }

    emitApiCall(endpoint: string, cursor?: string | null): void {
        this.emit({ type: 'api_call', endpoint, cursor })
    }

    emitApiResponse(count: number, hasMore: boolean, nextCursor?: string | null): void {
        this.emit({
            type: 'api_response',
            count,
            has_more: hasMore,
            next_cursor: nextCursor,
        })
    }

    emitComplete(): void {
        this.emit({ type: 'complete' })
    }

    emitError(errorCode?: string, message?: string): void {
        this.emit({ type: 'error', error_code: errorCode, message })
    }

    close(): void {
        if (this.outputStream && this.outputStream !== process.stderr) {
            ;(this.outputStream as fs.WriteStream).close()
        }
        this.enabled = false
        this.outputStream = null
    }
}

// Global singleton instance
let progressTracker: ProgressTracker | null = null

export function getProgressTracker(): ProgressTracker {
    if (!progressTracker) {
        progressTracker = new ProgressTracker()
    }
    return progressTracker
}

export function resetProgressTracker(): void {
    if (progressTracker) {
        progressTracker.close()
    }
    progressTracker = null
}

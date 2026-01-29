import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressEvent } from '../lib/progress.js'
import { getProgressTracker, ProgressTracker, resetProgressTracker } from '../lib/progress.js'

// Mock fs module
vi.mock('fs', () => ({
    default: {
        createWriteStream: vi.fn(),
    },
}))

describe('ProgressTracker', () => {
    let originalArgv: string[]
    let originalStderr: typeof process.stderr
    let mockStderr: { write: ReturnType<typeof vi.fn> }
    let mockWriteStream: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }

    beforeEach(() => {
        originalArgv = [...process.argv]
        originalStderr = process.stderr

        // Mock stderr
        mockStderr = {
            write: vi.fn(),
        }
        Object.defineProperty(process, 'stderr', {
            value: mockStderr,
            configurable: true,
        })

        // Mock write stream
        mockWriteStream = {
            write: vi.fn(),
            close: vi.fn(),
        }
        vi.mocked(fs.createWriteStream).mockReturnValue(
            mockWriteStream as unknown as fs.WriteStream,
        )

        vi.clearAllMocks()
        resetProgressTracker()
    })

    afterEach(() => {
        process.argv = originalArgv
        Object.defineProperty(process, 'stderr', {
            value: originalStderr,
            configurable: true,
        })
        vi.clearAllMocks()
        resetProgressTracker()
    })

    describe('initialization and enabling', () => {
        it.each([
            ['disabled by default', ['node', 'td', 'today'], false],
            [
                'enabled with --progress-jsonl flag',
                ['node', 'td', 'today', '--progress-jsonl'],
                true,
            ],
            [
                'enabled with --progress-jsonl=path flag',
                ['node', 'td', 'today', '--progress-jsonl=/tmp/progress.jsonl'],
                true,
            ],
            [
                'enabled with --progress-jsonl path as separate arg',
                ['node', 'td', 'today', '--progress-jsonl', '/tmp/progress.jsonl'],
                true,
            ],
        ])('should be %s', (_description, argv, expectedEnabled) => {
            process.argv = argv
            const tracker = new ProgressTracker()
            expect(tracker.isEnabled()).toBe(expectedEnabled)
        })
    })

    describe('output destinations', () => {
        it('should output to stderr by default', () => {
            process.argv = ['node', 'td', 'today', '--progress-jsonl']
            const tracker = new ProgressTracker()

            tracker.emit({ type: 'start', command: 'today' })

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(/"type":"start".*"command":"today"/),
            )
        })

        it('should create file when path is provided with equals', () => {
            process.argv = ['node', 'td', 'today', '--progress-jsonl=/tmp/progress.jsonl']
            const tracker = new ProgressTracker()

            expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/progress.jsonl', { flags: 'a' })

            tracker.emit({ type: 'start', command: 'today' })
            expect(mockWriteStream.write).toHaveBeenCalled()
        })

        it('should create file when path is provided as separate arg', () => {
            process.argv = ['node', 'td', 'today', '--progress-jsonl', '/tmp/progress.jsonl']
            const _tracker = new ProgressTracker()

            expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/progress.jsonl', { flags: 'a' })
        })

        it('should fall back to stderr if file creation fails', () => {
            process.argv = ['node', 'td', 'today', '--progress-jsonl=/invalid/path']
            vi.mocked(fs.createWriteStream).mockImplementation(() => {
                throw new Error('Permission denied')
            })

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            const tracker = new ProgressTracker()
            tracker.emit({ type: 'start', command: 'today' })

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Warning: Could not create progress file'),
            )
            expect(mockStderr.write).toHaveBeenCalled()

            consoleSpy.mockRestore()
        })
    })

    describe('event emission', () => {
        let tracker: ProgressTracker

        beforeEach(() => {
            process.argv = ['node', 'td', 'today', '--progress-jsonl']
            tracker = new ProgressTracker()
        })

        it('should emit start events', () => {
            tracker.emitStart('today')

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(/"type":"start".*"command":"today".*"timestamp"/),
            )
        })

        it('should emit api_call events', () => {
            tracker.emitApiCall('getTasks', 'cursor123')

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(
                    /"type":"api_call".*"endpoint":"getTasks".*"cursor":"cursor123"/,
                ),
            )
        })

        it('should emit api_call events without cursor', () => {
            tracker.emitApiCall('getUser')

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(/"type":"api_call".*"endpoint":"getUser"/),
            )
        })

        it('should emit api_response events', () => {
            tracker.emitApiResponse(50, true, 'nextCursor123')

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(
                    /"type":"api_response".*"count":50.*"has_more":true.*"next_cursor":"nextCursor123"/,
                ),
            )
        })

        it('should emit api_response events without next cursor', () => {
            tracker.emitApiResponse(30, false)

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(/"type":"api_response".*"count":30.*"has_more":false/),
            )
        })

        it('should emit complete events', () => {
            tracker.emitComplete()

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(/"type":"complete".*"timestamp"/),
            )
        })

        it('should emit error events', () => {
            tracker.emitError('UNAUTHORIZED', 'Invalid token')

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(
                    /"type":"error".*"error_code":"UNAUTHORIZED".*"message":"Invalid token"/,
                ),
            )
        })

        it('should emit error events with minimal info', () => {
            tracker.emitError()

            expect(mockStderr.write).toHaveBeenCalledWith(
                expect.stringMatching(/"type":"error".*"timestamp"/),
            )
        })

        it('should not emit events when disabled', () => {
            resetProgressTracker()
            process.argv = ['node', 'td', 'today'] // No --progress-jsonl flag
            const disabledTracker = new ProgressTracker()

            disabledTracker.emitStart('today')
            expect(mockStderr.write).not.toHaveBeenCalled()
        })

        it('should include valid ISO timestamps', () => {
            tracker.emitStart('today')

            const writeCall = vi.mocked(mockStderr.write).mock.calls[0][0] as string
            const eventData = JSON.parse(writeCall) as ProgressEvent

            expect(eventData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
            expect(new Date(eventData.timestamp).toISOString()).toBe(eventData.timestamp)
        })

        it('should emit properly formatted JSONL', () => {
            tracker.emitStart('today')
            tracker.emitComplete()

            const calls = vi.mocked(mockStderr.write).mock.calls
            expect(calls).toHaveLength(2)

            for (const call of calls) {
                const line = call[0] as string
                expect(line).toMatch(/^\{.*\}\n$/) // Valid JSON + newline
                expect(() => JSON.parse(line.trim())).not.toThrow()
            }
        })
    })

    describe('cleanup', () => {
        it('should close file stream when calling close()', () => {
            process.argv = ['node', 'td', 'today', '--progress-jsonl=/tmp/progress.jsonl']
            const tracker = new ProgressTracker()

            tracker.close()

            expect(mockWriteStream.close).toHaveBeenCalled()
            expect(tracker.isEnabled()).toBe(false)
        })

        it('should handle close() when using stderr', () => {
            process.argv = ['node', 'td', 'today', '--progress-jsonl']
            const tracker = new ProgressTracker()

            // Should not throw
            tracker.close()
            expect(tracker.isEnabled()).toBe(false)
        })
    })
})

describe('global progress tracker', () => {
    let originalArgv: string[]

    beforeEach(() => {
        originalArgv = [...process.argv]
        resetProgressTracker()
        vi.clearAllMocks()
    })

    afterEach(() => {
        process.argv = originalArgv
        resetProgressTracker()
    })

    it('should return singleton instance', () => {
        process.argv = ['node', 'td', 'today', '--progress-jsonl']

        const tracker1 = getProgressTracker()
        const tracker2 = getProgressTracker()

        expect(tracker1).toBe(tracker2)
    })

    it('should create new instance after reset', () => {
        process.argv = ['node', 'td', 'today', '--progress-jsonl']

        const tracker1 = getProgressTracker()
        resetProgressTracker()
        const tracker2 = getProgressTracker()

        expect(tracker1).not.toBe(tracker2)
    })

    it('should respect argv changes between instances', () => {
        // First instance - disabled
        process.argv = ['node', 'td', 'today']
        const tracker1 = getProgressTracker()
        expect(tracker1.isEnabled()).toBe(false)

        // Reset and create new instance with flag
        resetProgressTracker()
        process.argv = ['node', 'td', 'today', '--progress-jsonl']
        const tracker2 = getProgressTracker()
        expect(tracker2.isEnabled()).toBe(true)
    })
})

describe('edge cases and integration', () => {
    let originalArgv: string[]
    let mockStderr: { write: ReturnType<typeof vi.fn> }

    beforeEach(() => {
        originalArgv = [...process.argv]

        mockStderr = {
            write: vi.fn(),
        }
        Object.defineProperty(process, 'stderr', {
            value: mockStderr,
            configurable: true,
        })

        resetProgressTracker()
        vi.clearAllMocks()
    })

    afterEach(() => {
        process.argv = originalArgv
        resetProgressTracker()
    })

    it.each([
        ['flag in middle of arguments', ['node', 'td', '--progress-jsonl', 'today', '--json']],
        ['flag at end of arguments', ['node', 'td', 'today', '--json', '--progress-jsonl']],
        ['flag with empty path argument', ['node', 'td', 'today', '--progress-jsonl', '']],
        ['flag followed by another flag', ['node', 'td', 'today', '--progress-jsonl', '--json']],
    ])('should handle %s', (_description, argv) => {
        process.argv = argv
        const tracker = new ProgressTracker()
        expect(tracker.isEnabled()).toBe(true)
    })

    it('should handle multiple progress-jsonl flags (last one wins)', () => {
        process.argv = [
            'node',
            'td',
            '--progress-jsonl=/tmp/first',
            '--progress-jsonl=/tmp/second',
            'today',
        ]
        const _tracker = new ProgressTracker()

        expect(fs.createWriteStream).toHaveBeenLastCalledWith('/tmp/second', { flags: 'a' })
    })
})

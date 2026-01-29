import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadingSpinner, withSpinner } from '../lib/spinner.js'

// Mock yocto-spinner
const mockSpinnerInstance = {
    start: vi.fn().mockReturnThis(),
    success: vi.fn(),
    error: vi.fn(),
    stop: vi.fn(),
}

vi.mock('yocto-spinner', () => ({
    default: vi.fn(() => mockSpinnerInstance),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk', () => ({
    default: {
        green: vi.fn((text) => text),
        yellow: vi.fn((text) => text),
        blue: vi.fn((text) => text),
        red: vi.fn((text) => text),
        gray: vi.fn((text) => text),
        cyan: vi.fn((text) => text),
        magenta: vi.fn((text) => text),
    },
}))

describe('withSpinner', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset environment variables
        delete process.env.TD_SPINNER
        delete process.env.CI
        // Mock TTY as true by default
        Object.defineProperty(process.stdout, 'isTTY', {
            value: true,
            configurable: true,
        })
        // Clear process.argv
        process.argv = ['node', 'td']
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('should handle successful operations', async () => {
        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).toHaveBeenCalled()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
        expect(mockSpinnerInstance.error).not.toHaveBeenCalled()
    })

    it('should handle failed operations', async () => {
        await expect(
            withSpinner({ text: 'Testing...', color: 'blue' }, async () => {
                throw new Error('test error')
            }),
        ).rejects.toThrow('test error')

        expect(mockSpinnerInstance.start).toHaveBeenCalled()
        expect(mockSpinnerInstance.error).toHaveBeenCalled()
        expect(mockSpinnerInstance.stop).not.toHaveBeenCalled()
    })

    it('should not show spinner when noSpinner option is true', async () => {
        const result = await withSpinner(
            { text: 'Testing...', color: 'blue', noSpinner: true },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it('should not show spinner when TD_SPINNER=false', async () => {
        process.env.TD_SPINNER = 'false'

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it('should not show spinner in CI environment', async () => {
        process.env.CI = 'true'

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it('should not show spinner when not in TTY', async () => {
        Object.defineProperty(process.stdout, 'isTTY', {
            value: false,
            configurable: true,
        })

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it.each([
        ['--json', ['node', 'td', 'auth', 'status', '--json']],
        ['--ndjson', ['node', 'td', 'auth', 'status', '--ndjson']],
        ['--no-spinner', ['node', 'td', 'auth', 'status', '--no-spinner']],
        ['--progress-jsonl', ['node', 'td', 'today', '--progress-jsonl']],
        ['--progress-jsonl=path', ['node', 'td', 'today', '--progress-jsonl=/tmp/progress.jsonl']],
    ])('should not show spinner with %s flag', async (_flagName, argv) => {
        process.argv = argv

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })
})

describe('LoadingSpinner', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset environment variables
        delete process.env.TD_SPINNER
        delete process.env.CI
        // Mock TTY as true by default
        Object.defineProperty(process.stdout, 'isTTY', {
            value: true,
            configurable: true,
        })
        // Clear process.argv
        process.argv = ['node', 'td']
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('should start and stop spinner', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        expect(mockSpinnerInstance.start).toHaveBeenCalled()

        spinner.stop()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    })

    it('should show success message', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        spinner.succeed('Operation completed')
        expect(mockSpinnerInstance.success).toHaveBeenCalledWith('✓ Operation completed')
    })

    it('should show failure message', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        spinner.fail('Operation failed')
        expect(mockSpinnerInstance.error).toHaveBeenCalledWith('✗ Operation failed')
    })

    it('should handle multiple calls to stop gracefully', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        spinner.stop()
        spinner.stop() // Should not throw

        expect(mockSpinnerInstance.stop).toHaveBeenCalledTimes(1)
    })

    it('should handle succeed/fail without starting', () => {
        const spinner = new LoadingSpinner()
        spinner.succeed('Test') // Should not throw
        spinner.fail('Test') // Should not throw

        expect(mockSpinnerInstance.success).not.toHaveBeenCalled()
        expect(mockSpinnerInstance.error).not.toHaveBeenCalled()
    })
})

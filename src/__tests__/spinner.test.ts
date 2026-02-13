import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import yoctoSpinnerFactory from 'yocto-spinner'
import {
    LoadingSpinner,
    resetEarlySpinner,
    startEarlySpinner,
    stopEarlySpinner,
    withSpinner,
} from '../lib/spinner.js'

// Mock yocto-spinner
const mockSpinnerInstance = {
    start: vi.fn().mockReturnThis(),
    success: vi.fn(),
    error: vi.fn(),
    stop: vi.fn(),
    text: '',
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
        resetEarlySpinner()
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
        resetEarlySpinner()
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
        resetEarlySpinner()
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
        resetEarlySpinner()
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

describe('early spinner', () => {
    const yoctoSpinner = vi.mocked(yoctoSpinnerFactory)

    beforeEach(() => {
        vi.clearAllMocks()
        resetEarlySpinner()
        mockSpinnerInstance.text = ''
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
        resetEarlySpinner()
    })

    it('should start and stop early spinner', () => {
        startEarlySpinner()

        expect(yoctoSpinner).toHaveBeenCalledWith({ text: 'Loading...' })
        expect(mockSpinnerInstance.start).toHaveBeenCalled()

        stopEarlySpinner()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    })

    it('should not start early spinner when not in TTY', () => {
        Object.defineProperty(process.stdout, 'isTTY', {
            value: false,
            configurable: true,
        })

        startEarlySpinner()
        expect(yoctoSpinner).not.toHaveBeenCalled()
    })

    it.each([
        ['--json', ['node', 'td', 'today', '--json']],
        ['--ndjson', ['node', 'td', 'today', '--ndjson']],
        ['--no-spinner', ['node', 'td', 'today', '--no-spinner']],
    ])('should not start early spinner with %s flag', (_flagName, argv) => {
        process.argv = argv

        startEarlySpinner()
        expect(yoctoSpinner).not.toHaveBeenCalled()
    })

    it('should not start early spinner in CI environment', () => {
        process.env.CI = 'true'

        startEarlySpinner()
        expect(yoctoSpinner).not.toHaveBeenCalled()
    })

    it('should not start early spinner when TD_SPINNER=false', () => {
        process.env.TD_SPINNER = 'false'

        startEarlySpinner()
        expect(yoctoSpinner).not.toHaveBeenCalled()
    })

    it('should be adopted by LoadingSpinner.start() — reuses instance and updates text', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Loading tasks...', color: 'blue' })

        // Should NOT have created a new yocto-spinner
        expect(yoctoSpinner).not.toHaveBeenCalled()
        // Should NOT have called .start() again (already running)
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
        // Should have updated the text
        expect(mockSpinnerInstance.text).toBe('Loading tasks...')
    })

    it('should release back on stop — available for re-adoption by next API call', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        // First LoadingSpinner adopts the early spinner
        const spinner1 = new LoadingSpinner()
        spinner1.start({ text: 'Loading tasks...', color: 'blue' })
        expect(yoctoSpinner).not.toHaveBeenCalled()

        // stop() releases it back instead of actually stopping
        spinner1.stop()
        expect(mockSpinnerInstance.stop).not.toHaveBeenCalled()

        // Second LoadingSpinner re-adopts the same instance
        const spinner2 = new LoadingSpinner()
        spinner2.start({ text: 'Checking authentication...', color: 'blue' })
        expect(yoctoSpinner).not.toHaveBeenCalled()
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
        expect(mockSpinnerInstance.text).toBe('Checking authentication...')

        // Final cleanup via stopEarlySpinner actually stops it
        spinner2.stop()
        stopEarlySpinner()
        expect(mockSpinnerInstance.stop).toHaveBeenCalledTimes(1)
    })

    it('should actually stop on fail even if adopted', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Loading tasks...', color: 'blue' })
        spinner.fail('Request failed')

        expect(mockSpinnerInstance.error).toHaveBeenCalled()
        // Should not be released back — error terminates the spinner
        stopEarlySpinner()
        expect(mockSpinnerInstance.stop).not.toHaveBeenCalled()
    })

    it('should auto-stop when stdout is written to', () => {
        startEarlySpinner()
        expect(mockSpinnerInstance.start).toHaveBeenCalled()

        // Simulate command output — spinner should auto-clear
        process.stdout.write('output\n')
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    })

    it('should be cleaned up by stopEarlySpinner if never adopted', () => {
        startEarlySpinner()
        expect(mockSpinnerInstance.start).toHaveBeenCalled()

        stopEarlySpinner()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()

        // Subsequent stop should be a no-op
        vi.clearAllMocks()
        stopEarlySpinner()
        expect(mockSpinnerInstance.stop).not.toHaveBeenCalled()
    })
})

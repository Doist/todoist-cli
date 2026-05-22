import type { MockInstance } from 'vitest'
import { vi } from 'vitest'

export function mockConsoleLog(): MockInstance {
    return vi.spyOn(console, 'log').mockImplementation(() => {})
}

export function mockConsoleError(): MockInstance {
    return vi.spyOn(console, 'error').mockImplementation(() => {})
}

export function mockProcessStdout(): MockInstance {
    return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

export function mockProcessStderr(): MockInstance {
    return vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
}

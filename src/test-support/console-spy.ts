import type { MockInstance } from 'vitest'
import { vi } from 'vitest'

export function mockConsoleLog(): MockInstance {
    return vi.spyOn(console, 'log').mockImplementation(() => {})
}

export function mockConsoleError(): MockInstance {
    return vi.spyOn(console, 'error').mockImplementation(() => {})
}

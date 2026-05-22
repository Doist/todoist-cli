import { vi } from 'vitest'
import { getApi } from '../lib/api/core.js'
import { createMockApi, type MockApi } from './mock-api.js'

export function setupApiMock(): MockApi {
    const mockApi = createMockApi()
    vi.mocked(getApi).mockResolvedValue(mockApi)
    return mockApi
}

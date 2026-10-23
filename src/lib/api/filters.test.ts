import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./core.js', () => ({
    getApi: vi.fn(),
}))

import { setupApiMock } from '../../test-support/api-mock.js'
import type { MockApi } from '../../test-support/mock-api.js'
import { deleteFilter } from './filters.js'

describe('deleteFilter', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('deletes the filter through the REST endpoint', async () => {
        await deleteFilter('filter-123')

        expect(mockApi.deleteFilter).toHaveBeenCalledWith('filter-123')
        expect(mockApi.sync).not.toHaveBeenCalled()
    })
})

process.env.TZ = 'UTC'

import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        root: 'src',
        include: ['**/*.test.ts'],
        // Inline @doist/cli-core so vitest's module mocks (e.g. vi.doMock for
        // 'node:fs/promises' in auth.test.ts) reach its compiled imports.
        // Without this, vitest treats it as external and Node's native
        // resolver bypasses the mock substitution.
        server: {
            deps: {
                inline: ['@doist/cli-core'],
            },
        },
    },
})

import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises')

import { readFile } from 'node:fs/promises'
import packageJson from '../../package.json' with { type: 'json' }
import { registerChangelogCommand } from './changelog.js'

const mockReadFile = vi.mocked(readFile)

const SAMPLE_CHANGELOG = `# Changelog

## [9.9.0](https://example.com) (2026-05-09)

### Features
* delegated to cli-core

## [9.8.0](https://example.com) (2026-05-08)

### Features
* prior release
`

describe('changelog wrapper', () => {
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
        mockReadFile.mockReset()
    })

    it('passes the todoist CHANGELOG.md path through to cli-core', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)
        const program = new Command()
        program.exitOverride()
        registerChangelogCommand(program)

        await program.parseAsync(['node', 'td', 'changelog', '-n', '1'])

        expect(mockReadFile).toHaveBeenCalledTimes(1)
        const [path] = mockReadFile.mock.calls[0]
        expect(String(path)).toMatch(/\/CHANGELOG\.md$/)
    })

    it('emits a footer link pointing at the todoist repo and current version', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)
        const program = new Command()
        program.exitOverride()
        registerChangelogCommand(program)

        await program.parseAsync(['node', 'td', 'changelog', '-n', '1'])

        const all = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(all).toContain(
            `View full changelog: https://github.com/Doist/todoist-cli/blob/v${packageJson.version}/CHANGELOG.md`,
        )
    })
})

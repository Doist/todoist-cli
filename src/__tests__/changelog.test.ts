import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises')
vi.mock('chalk')
vi.mock('../lib/markdown.js', () => ({
    renderMarkdown: (text: string) => text,
}))

import { readFile } from 'node:fs/promises'
import { registerChangelogCommand } from '../commands/changelog.js'

const mockReadFile = vi.mocked(readFile)

const SAMPLE_CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0](https://example.com) (2026-03-15)

### Features
* feature five

## [1.4.0](https://example.com) (2026-03-14)

### Features
* feature four

## [1.3.0](https://example.com) (2026-03-13)

### Bug Fixes
* fix three

## [1.2.0](https://example.com) (2026-03-12)

### Features
* feature two

## [1.1.0](https://example.com) (2026-03-11)

### Features
* feature one

## [1.0.0](https://example.com) (2026-03-10)

### Features
* initial release
`

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerChangelogCommand(program)
    return program
}

describe('changelog command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        process.exitCode = undefined
    })

    afterEach(() => {
        vi.restoreAllMocks()
        process.exitCode = undefined
    })

    it('shows last 5 versions by default', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'changelog'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1.5.0'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1.1.0'))
        // Should show "view full changelog" link since there are 6 versions
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('View full changelog'))
    })

    it('includes latest version when changelog has no preamble', async () => {
        const noPreambleChangelog = `## [2.0.0](https://example.com) (2026-03-20)

### Features
* new major version

## [1.5.0](https://example.com) (2026-03-15)

### Features
* feature five
`
        mockReadFile.mockResolvedValue(noPreambleChangelog)

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'changelog'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).toContain('2.0.0')
        expect(output).toContain('1.5.0')
    })

    it('respects --count option', async () => {
        mockReadFile.mockResolvedValue(SAMPLE_CHANGELOG)

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'changelog', '-n', '2'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).toContain('1.5.0')
        expect(output).toContain('1.4.0')
        expect(output).not.toContain('1.3.0')
    })

    it('handles fewer entries than requested', async () => {
        const shortChangelog = `# Changelog

## [1.1.0](https://example.com) (2026-03-11)

### Features
* only version
`
        mockReadFile.mockResolvedValue(shortChangelog)

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'changelog'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1.1.0'))
        // Should NOT show "view full changelog" link since all versions are shown
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('View full changelog'))
    })

    it('handles missing changelog file', async () => {
        mockReadFile.mockRejectedValue(new Error('ENOENT'))

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'changelog'])

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('Could not read changelog file'),
        )
        expect(process.exitCode).toBe(1)
    })

    it('handles invalid count', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'changelog', '-n', 'abc'])

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('Count must be a positive number'),
        )
        expect(process.exitCode).toBe(1)
    })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printMovedNotice } from './package-move.js'

vi.mock('chalk')

const NOTICE = 'td has moved to @todoist/cli. Run "td update" to switch.\n'

describe('printMovedNotice', () => {
    const stderr = process.stderr as unknown as { isTTY?: boolean }
    const originalIsTTY = stderr.isTTY
    const originalScript = process.argv[1]
    let write: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        process.argv[1] = '/usr/local/lib/node_modules/@doist/todoist-cli/dist/index.js'
        write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
        stderr.isTTY = originalIsTTY
        process.argv[1] = originalScript
    })

    it('writes the notice to a terminal stderr', () => {
        stderr.isTTY = true

        printMovedNotice('today')

        expect(write).toHaveBeenCalledWith(NOTICE)
    })

    it('writes the notice when no command was given', () => {
        stderr.isTTY = true

        printMovedNotice(undefined)

        expect(write).toHaveBeenCalledWith(NOTICE)
    })

    it('stays quiet when stderr is not a terminal', () => {
        stderr.isTTY = undefined

        printMovedNotice('today')

        expect(write).not.toHaveBeenCalled()
    })

    it.each(['update', 'completion-server'])('stays quiet for `td %s`', (command) => {
        stderr.isTTY = true

        printMovedNotice(command)

        expect(write).not.toHaveBeenCalled()
    })

    it('stays quiet for a Homebrew install', () => {
        stderr.isTTY = true
        process.argv[1] =
            '/opt/homebrew/Cellar/todoist-cli/5.13.0/libexec/lib/node_modules/@doist/todoist-cli/dist/index.js'

        printMovedNotice('today')

        expect(write).not.toHaveBeenCalled()
    })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    getProgressJsonlPath,
    getVerboseLevel,
    isAccessible,
    isJsonMode,
    isNdjsonMode,
    isQuiet,
    isRawMode,
    parseGlobalArgs,
    resetGlobalArgs,
    shouldDisableSpinner,
} from '../lib/global-args.js'

describe('parseGlobalArgs', () => {
    describe('long flags', () => {
        it('parses --json', () => {
            expect(parseGlobalArgs(['--json']).json).toBe(true)
        })

        it('parses --ndjson', () => {
            expect(parseGlobalArgs(['--ndjson']).ndjson).toBe(true)
        })

        it('parses --quiet', () => {
            expect(parseGlobalArgs(['--quiet']).quiet).toBe(true)
        })

        it('parses --verbose as 1', () => {
            expect(parseGlobalArgs(['--verbose']).verbose).toBe(1)
        })

        it('parses --accessible', () => {
            expect(parseGlobalArgs(['--accessible']).accessible).toBe(true)
        })

        it('parses --no-spinner', () => {
            expect(parseGlobalArgs(['--no-spinner']).noSpinner).toBe(true)
        })

        it('parses --raw', () => {
            expect(parseGlobalArgs(['--raw']).raw).toBe(true)
        })

        it('defaults all flags to false/0', () => {
            const result = parseGlobalArgs([])
            expect(result).toEqual({
                json: false,
                ndjson: false,
                quiet: false,
                verbose: 0,
                accessible: false,
                noSpinner: false,
                raw: false,
                progressJsonl: false,
            })
        })
    })

    describe('short flags', () => {
        it('parses -q as quiet', () => {
            expect(parseGlobalArgs(['-q']).quiet).toBe(true)
        })

        it('parses -v as verbose level 1', () => {
            expect(parseGlobalArgs(['-v']).verbose).toBe(1)
        })
    })

    describe('grouped short flags', () => {
        it('parses -vq as verbose + quiet', () => {
            const result = parseGlobalArgs(['-vq'])
            expect(result.verbose).toBe(1)
            expect(result.quiet).toBe(true)
        })

        it('parses -qv as quiet + verbose', () => {
            const result = parseGlobalArgs(['-qv'])
            expect(result.verbose).toBe(1)
            expect(result.quiet).toBe(true)
        })

        it('parses -vvv as verbose level 3', () => {
            expect(parseGlobalArgs(['-vvv']).verbose).toBe(3)
        })

        it('parses -vvq as verbose level 2 + quiet', () => {
            const result = parseGlobalArgs(['-vvq'])
            expect(result.verbose).toBe(2)
            expect(result.quiet).toBe(true)
        })

        it('ignores unknown short flags', () => {
            const result = parseGlobalArgs(['-xvq'])
            expect(result.verbose).toBe(1)
            expect(result.quiet).toBe(true)
        })
    })

    describe('verbose counting', () => {
        it('stacks --verbose flags', () => {
            expect(parseGlobalArgs(['--verbose', '--verbose', '--verbose']).verbose).toBe(3)
        })

        it('stacks mixed -v and --verbose', () => {
            expect(parseGlobalArgs(['-vv', '--verbose']).verbose).toBe(3)
        })

        it('caps verbose at 4', () => {
            expect(parseGlobalArgs(['-vvvvvv']).verbose).toBe(4)
        })

        it('caps verbose at 4 with mixed flags', () => {
            expect(parseGlobalArgs(['-vvv', '--verbose', '--verbose']).verbose).toBe(4)
        })
    })

    describe('--progress-jsonl', () => {
        it('sets true when present without value', () => {
            expect(parseGlobalArgs(['--progress-jsonl']).progressJsonl).toBe(true)
        })

        it('extracts value from = format', () => {
            expect(parseGlobalArgs(['--progress-jsonl=/tmp/out']).progressJsonl).toBe('/tmp/out')
        })

        it('extracts value from next arg', () => {
            expect(parseGlobalArgs(['--progress-jsonl', '/tmp/out']).progressJsonl).toBe('/tmp/out')
        })

        it('does not consume next arg if it starts with -', () => {
            const result = parseGlobalArgs(['--progress-jsonl', '--json'])
            expect(result.progressJsonl).toBe(true)
            expect(result.json).toBe(true)
        })

        it('uses last occurrence (last wins)', () => {
            expect(
                parseGlobalArgs(['--progress-jsonl=/first', '--progress-jsonl=/second'])
                    .progressJsonl,
            ).toBe('/second')
        })

        it('preserves = characters in path value', () => {
            expect(parseGlobalArgs(['--progress-jsonl=/tmp/a=b=c']).progressJsonl).toBe(
                '/tmp/a=b=c',
            )
        })
    })

    describe('-- terminator', () => {
        it('stops parsing flags after --', () => {
            const result = parseGlobalArgs(['--json', '--', '-vq', '--quiet'])
            expect(result.json).toBe(true)
            expect(result.verbose).toBe(0)
            expect(result.quiet).toBe(false)
        })
    })

    describe('positional arguments', () => {
        it('does not treat positional args as flags', () => {
            const result = parseGlobalArgs(['today', '--json'])
            expect(result.json).toBe(true)
        })

        it('handles mixed positional and flag args', () => {
            const result = parseGlobalArgs(['task', 'add', '--quiet', 'Buy milk'])
            expect(result.quiet).toBe(true)
        })
    })
})

describe('query functions', () => {
    const originalArgv = process.argv

    beforeEach(() => {
        resetGlobalArgs()
    })

    afterEach(() => {
        process.argv = originalArgv
        resetGlobalArgs()
    })

    it('isJsonMode reads from parsed args', () => {
        process.argv = ['node', 'td', 'today', '--json']
        expect(isJsonMode()).toBe(true)
    })

    it('isNdjsonMode reads from parsed args', () => {
        process.argv = ['node', 'td', 'today', '--ndjson']
        expect(isNdjsonMode()).toBe(true)
    })

    it('isQuiet reads from parsed args', () => {
        process.argv = ['node', 'td', 'task', 'add', '-q', 'Buy milk']
        expect(isQuiet()).toBe(true)
    })

    it('isQuiet detects grouped short flag -vq', () => {
        process.argv = ['node', 'td', '-vq', 'today']
        expect(isQuiet()).toBe(true)
    })

    it('isRawMode reads from parsed args', () => {
        process.argv = ['node', 'td', 'task', 'view', 'abc', '--raw']
        expect(isRawMode()).toBe(true)
    })

    it('getVerboseLevel counts -vvv correctly', () => {
        process.argv = ['node', 'td', '-vvv', 'today']
        expect(getVerboseLevel()).toBe(3)
    })

    it('getProgressJsonlPath returns path', () => {
        process.argv = ['node', 'td', '--progress-jsonl=/tmp/out', 'today']
        expect(getProgressJsonlPath()).toBe('/tmp/out')
    })
})

describe('isAccessible', () => {
    const originalArgv = process.argv
    const originalEnv = process.env.TD_ACCESSIBLE

    beforeEach(() => {
        resetGlobalArgs()
        delete process.env.TD_ACCESSIBLE
    })

    afterEach(() => {
        process.argv = originalArgv
        resetGlobalArgs()
        if (originalEnv === undefined) {
            delete process.env.TD_ACCESSIBLE
        } else {
            process.env.TD_ACCESSIBLE = originalEnv
        }
    })

    it('returns true when TD_ACCESSIBLE=1', () => {
        process.env.TD_ACCESSIBLE = '1'
        expect(isAccessible()).toBe(true)
    })

    it('returns true when --accessible is in argv', () => {
        process.argv = ['node', 'td', 'today', '--accessible']
        expect(isAccessible()).toBe(true)
    })

    it('returns false by default', () => {
        process.argv = ['node', 'td', 'today']
        expect(isAccessible()).toBe(false)
    })
})

describe('shouldDisableSpinner', () => {
    const originalArgv = process.argv
    const originalTdSpinner = process.env.TD_SPINNER
    const originalCI = process.env.CI

    beforeEach(() => {
        resetGlobalArgs()
        delete process.env.TD_SPINNER
        delete process.env.CI
        process.argv = ['node', 'td']
    })

    afterEach(() => {
        process.argv = originalArgv
        resetGlobalArgs()
        if (originalTdSpinner === undefined) {
            delete process.env.TD_SPINNER
        } else {
            process.env.TD_SPINNER = originalTdSpinner
        }
        if (originalCI === undefined) {
            delete process.env.CI
        } else {
            process.env.CI = originalCI
        }
    })

    it('returns false by default', () => {
        expect(shouldDisableSpinner()).toBe(false)
    })

    it('returns true when TD_SPINNER=false', () => {
        process.env.TD_SPINNER = 'false'
        expect(shouldDisableSpinner()).toBe(true)
    })

    it('returns true in CI', () => {
        process.env.CI = 'true'
        expect(shouldDisableSpinner()).toBe(true)
    })

    it.each([
        ['--json', ['node', 'td', 'today', '--json']],
        ['--ndjson', ['node', 'td', 'today', '--ndjson']],
        ['--no-spinner', ['node', 'td', 'today', '--no-spinner']],
        ['--progress-jsonl', ['node', 'td', 'today', '--progress-jsonl']],
        ['--verbose', ['node', 'td', 'today', '--verbose']],
        ['-v', ['node', 'td', 'today', '-v']],
        ['-vq (grouped)', ['node', 'td', '-vq', 'today']],
    ])('returns true with %s', (_label, argv) => {
        process.argv = argv
        resetGlobalArgs()
        expect(shouldDisableSpinner()).toBe(true)
    })
})

describe('caching', () => {
    const originalArgv = process.argv

    afterEach(() => {
        process.argv = originalArgv
        resetGlobalArgs()
    })

    it('caches the result across calls', () => {
        resetGlobalArgs()
        process.argv = ['node', 'td', '--json']

        expect(isJsonMode()).toBe(true)

        // Change argv — should still return cached result
        process.argv = ['node', 'td']
        expect(isJsonMode()).toBe(true)
    })

    it('resetGlobalArgs clears the cache', () => {
        process.argv = ['node', 'td', '--json']
        resetGlobalArgs()
        expect(isJsonMode()).toBe(true)

        process.argv = ['node', 'td']
        resetGlobalArgs()
        expect(isJsonMode()).toBe(false)
    })
})

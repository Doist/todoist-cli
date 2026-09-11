import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isJsonMode, resetGlobalArgs } from '../../lib/global-args.js'
import { hostDispatchOptions } from './dispatch.js'

describe('hostDispatchOptions', () => {
    const realArgv = process.argv

    function setArgv(...args: string[]) {
        process.argv = ['node', 'td', ...args]
    }

    beforeEach(() => {
        // The spinner gate also turns itself off under CI, so pin that here
        // rather than having these assertions depend on where they run.
        vi.stubEnv('CI', '')
        resetGlobalArgs()
    })

    afterEach(() => {
        process.argv = realArgv
        vi.unstubAllEnvs()
        resetGlobalArgs()
    })

    it('stops reading td flags at the extension name', () => {
        // `--json` here is the extension's argument, not td's output mode.
        setArgv('goals', '--json', '--user', 'alice')
        const options = hostDispatchOptions(0)

        expect(options.user).toBeUndefined()
        expect(isJsonMode()).toBe(false)
    })

    it('passes on an account named before the extension', () => {
        setArgv('--user', 'alice', 'goals', 'list')
        expect(hostDispatchOptions(2).user).toBe('alice')
    })

    it('passes on an account named by the environment', () => {
        setArgv('goals')
        vi.stubEnv('TD_USER', 'bob')
        expect(hostDispatchOptions(0).user).toBe('bob')
    })

    it('prefers the flag over the environment', () => {
        setArgv('--user', 'alice', 'goals')
        vi.stubEnv('TD_USER', 'bob')
        expect(hostDispatchOptions(2).user).toBe('alice')
    })

    it('treats an empty TD_USER as naming nobody', () => {
        setArgv('goals')
        vi.stubEnv('TD_USER', '')
        expect(hostDispatchOptions(0).user).toBeUndefined()
    })

    it('translates verbosity into the variable td reads', () => {
        setArgv('-vv', 'goals')
        expect(hostDispatchOptions(1).env?.TD_VERBOSE).toBe('2')
    })

    it('leaves the verbosity variable alone when it was not asked for', () => {
        setArgv('goals')
        // Undefined deletes rather than sets, so an inherited value cannot
        // make a nested call more verbose than this one was.
        expect(hostDispatchOptions(0).env?.TD_VERBOSE).toBeUndefined()
    })

    it('tells the extension to keep spinners off when td would have', () => {
        setArgv('--no-spinner', 'goals')
        expect(hostDispatchOptions(1).env?.TD_SPINNER).toBe('false')
    })

    it('does not read a flag that comes after the name as td’s own', () => {
        setArgv('goals', '--no-spinner', '-vvv')
        const options = hostDispatchOptions(0)
        expect(options.env?.TD_SPINNER).toBeUndefined()
        expect(options.env?.TD_VERBOSE).toBeUndefined()
    })
})

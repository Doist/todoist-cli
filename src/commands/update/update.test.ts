import { Command } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../../package.json' with { type: 'json' }
import { getConfigPath } from '../../lib/config.js'

describe('update wrapper', () => {
    afterEach(() => {
        vi.doUnmock('@doist/cli-core/commands')
        vi.resetModules()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('forwards todoist-cli wiring (packageName, version, configPath, changelog hint, spinner) to cli-core', async () => {
        const registerCoreSpy = vi.fn()
        vi.doMock('@doist/cli-core/commands', () => ({
            registerUpdateCommand: registerCoreSpy,
        }))

        const { registerUpdateCommand } = await import('./index.js')
        const { withSpinner } = await import('../../lib/spinner.js')
        const program = new Command()
        registerUpdateCommand(program)

        expect(registerCoreSpy).toHaveBeenCalledTimes(1)
        const [passedProgram, options] = registerCoreSpy.mock.calls[0]
        expect(passedProgram).toBe(program)
        expect(options).toEqual({
            packageName: packageJson.name,
            currentVersion: packageJson.version,
            configPath: getConfigPath(),
            changelogCommandName: 'td changelog',
            withSpinner,
        })
    })

    it('parses `td update --check` end-to-end and hits the registry with the wired packageName', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ version: packageJson.version }),
        })
        vi.stubGlobal('fetch', fetchMock)

        const { registerUpdateCommand } = await import('./index.js')
        const program = new Command()
        program.exitOverride()
        registerUpdateCommand(program)

        await program.parseAsync(['node', 'td', 'update', '--check'])

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url] = fetchMock.mock.calls[0]
        expect(url).toBe(`https://registry.npmjs.org/${packageJson.name}/latest`)
    })
})

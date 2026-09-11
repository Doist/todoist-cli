import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const REAL_PLATFORM = process.platform
const HOME = join('/home', 'tester')
const WINDOWS_LOCAL_APPDATA = 'C:\\Users\\tester\\AppData\\Local'

/**
 * Load the module with `homedir()` pointed somewhere predictable. `paths.ts`
 * imports `node:os` directly, so mocking the module reaches it — unlike the
 * config path, which is resolved inside cli-core's compiled output.
 */
async function loadPaths(home = HOME) {
    vi.resetModules()
    vi.doMock('node:os', () => ({ homedir: () => home }))
    return import('./paths.js')
}

function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

/** The XDG variables are read from the real environment, so clear them first. */
function clearEnv() {
    for (const name of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'LOCALAPPDATA']) {
        vi.stubEnv(name, undefined)
    }
}

afterEach(() => {
    setPlatform(REAL_PLATFORM)
    vi.unstubAllEnvs()
    vi.doUnmock('node:os')
    vi.resetModules()
})

describe('getDataDir', () => {
    it.each(['linux', 'darwin'] as const)('uses the XDG layout on %s', async (platform) => {
        clearEnv()
        setPlatform(platform)
        const { getDataDir } = await loadPaths()
        expect(getDataDir()).toBe(join(HOME, '.local', 'share', 'todoist-cli'))
    })

    it('prefers XDG_DATA_HOME when it is set', async () => {
        clearEnv()
        setPlatform('linux')
        vi.stubEnv('XDG_DATA_HOME', join('/elsewhere', 'data'))
        const { getDataDir } = await loadPaths()
        expect(getDataDir()).toBe(join('/elsewhere', 'data', 'todoist-cli'))
    })

    it('uses LOCALAPPDATA on Windows', async () => {
        clearEnv()
        setPlatform('win32')
        vi.stubEnv('LOCALAPPDATA', WINDOWS_LOCAL_APPDATA)
        const { getDataDir } = await loadPaths()
        // Joined rather than spelled out: `node:path` uses the separator of
        // whichever host runs the suite, not of the platform being faked.
        expect(getDataDir()).toBe(join(WINDOWS_LOCAL_APPDATA, 'todoist-cli'))
    })

    it('falls back to the documented location when LOCALAPPDATA is missing', async () => {
        clearEnv()
        setPlatform('win32')
        const { getDataDir } = await loadPaths('C:\\Users\\tester')
        expect(getDataDir()).toBe(join('C:\\Users\\tester', 'AppData', 'Local', 'todoist-cli'))
    })

    it('lets XDG_DATA_HOME win on Windows too', async () => {
        clearEnv()
        setPlatform('win32')
        vi.stubEnv('LOCALAPPDATA', WINDOWS_LOCAL_APPDATA)
        vi.stubEnv('XDG_DATA_HOME', join('/elsewhere', 'data'))
        const { getDataDir } = await loadPaths()
        expect(getDataDir()).toBe(join('/elsewhere', 'data', 'todoist-cli'))
    })
})

describe('getStateDir', () => {
    it.each(['linux', 'darwin'] as const)('uses the XDG layout on %s', async (platform) => {
        clearEnv()
        setPlatform(platform)
        const { getStateDir } = await loadPaths()
        expect(getStateDir()).toBe(join(HOME, '.local', 'state', 'todoist-cli'))
    })

    it('prefers XDG_STATE_HOME when it is set', async () => {
        clearEnv()
        setPlatform('linux')
        vi.stubEnv('XDG_STATE_HOME', join('/elsewhere', 'state'))
        const { getStateDir } = await loadPaths()
        expect(getStateDir()).toBe(join('/elsewhere', 'state', 'todoist-cli'))
    })

    it('nests under the data root on Windows, which has no state root', async () => {
        clearEnv()
        setPlatform('win32')
        vi.stubEnv('LOCALAPPDATA', WINDOWS_LOCAL_APPDATA)
        const { getDataDir, getStateDir } = await loadPaths()
        expect(getStateDir()).toBe(join(getDataDir(), 'state'))
    })
})

describe('a relative XDG value', () => {
    // The spec says these must be absolute and that a relative value is to be
    // ignored. Honouring one would tie the directory to the shell's cwd.
    it.each([
        ['XDG_DATA_HOME', 'cache'],
        ['XDG_DATA_HOME', './cache'],
        ['XDG_DATA_HOME', '../cache'],
    ])('is ignored for %s=%s', async (name, value) => {
        clearEnv()
        setPlatform('linux')
        vi.stubEnv(name, value)
        const { getDataDir } = await loadPaths()
        expect(getDataDir()).toBe(join(HOME, '.local', 'share', 'todoist-cli'))
    })

    it('is ignored for XDG_STATE_HOME', async () => {
        clearEnv()
        setPlatform('linux')
        vi.stubEnv('XDG_STATE_HOME', 'state')
        const { getStateDir } = await loadPaths()
        expect(getStateDir()).toBe(join(HOME, '.local', 'state', 'todoist-cli'))
    })

    it('is ignored for an empty value', async () => {
        clearEnv()
        setPlatform('linux')
        vi.stubEnv('XDG_DATA_HOME', '')
        const { getDataDir } = await loadPaths()
        expect(getDataDir()).toBe(join(HOME, '.local', 'share', 'todoist-cli'))
    })
})

describe('the two directories', () => {
    it('stay distinct on every platform', async () => {
        for (const platform of ['linux', 'darwin', 'win32'] as const) {
            clearEnv()
            setPlatform(platform)
            const { getDataDir, getStateDir } = await loadPaths()
            expect(getDataDir()).not.toBe(getStateDir())
        }
    })
})

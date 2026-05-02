import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/browser.js', () => ({
    openInBrowser: vi.fn(),
}))

vi.mock('../../lib/config.js', () => ({
    readConfig: vi.fn().mockResolvedValue({}),
    writeConfig: vi.fn().mockResolvedValue(undefined),
}))

import { openInBrowser } from '../../lib/browser.js'
import { readConfig, writeConfig } from '../../lib/config.js'
import { registerHelpCenterCommand } from './index.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerHelpCenterCommand(program)
    return program
}

function createJsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
    return new Response(JSON.stringify(body), {
        status,
        statusText,
        headers: { 'content-type': 'application/json' },
    })
}

describe('hc command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let fetchSpy: ReturnType<typeof vi.fn>
    const mockReadConfig = vi.mocked(readConfig)
    const mockWriteConfig = vi.mocked(writeConfig)

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)
        mockReadConfig.mockResolvedValue({})
        mockWriteConfig.mockResolvedValue(undefined)
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        vi.unstubAllGlobals()
    })

    it('searches the Help Center and prints article ids alongside results', async () => {
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                count: 1,
                results: [
                    {
                        id: 360000269065,
                        title: 'Manage your notifications in Todoist',
                        html_url:
                            'https://get.todoist.help/hc/en-us/articles/360000269065-manage-your-notifications',
                        snippet: '...and web <em>notifications</em> are enabled by default...',
                        body: '<p>Full HTML body should stay out of search output</p>',
                    },
                ],
            }),
        )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'search', 'notifications'])

        const output = consoleSpy.mock.calls.map((call: [string]) => call[0]).join('\n')
        expect(output).toContain('Manage your notifications in Todoist')
        expect(output).toContain('id:360000269065')
        expect(output).toContain(
            'https://get.todoist.help/hc/en-us/articles/360000269065-manage-your-notifications',
        )
        expect(output).toContain('...and web notifications are enabled by default...')

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(String(fetchSpy.mock.calls[0][0])).toContain(
            '/api/v2/help_center/articles/search?query=notifications&locale=en-us&per_page=10',
        )
    })

    it('returns bounded JSON search results without article bodies', async () => {
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                results: [
                    {
                        id: 205348301,
                        title: 'Set reminders for your tasks',
                        html_url:
                            'https://get.todoist.help/hc/en-us/articles/205348301-set-reminders',
                        snippet: '...send a push notification...',
                        body: '<p>Full article body</p>',
                    },
                ],
            }),
        )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'search', 'reminders', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed).toEqual([
            {
                id: '205348301',
                title: 'Set reminders for your tasks',
                htmlUrl: 'https://get.todoist.help/hc/en-us/articles/205348301-set-reminders',
                snippet: '...send a push notification...',
                locale: 'en-us',
            },
        ])
    })

    it('lists supported locales with names and the default marker', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: ['en-us', 'es', 'pt-br'],
                    default_locale: 'en-us',
                }),
            )
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: [
                        {
                            locale: 'en-US',
                            name: 'English',
                            native_name: 'English (United States)',
                            presentation_name: 'English (United States)',
                            rtl: false,
                        },
                        {
                            locale: 'es',
                            name: 'Español',
                            native_name: 'español',
                            presentation_name: 'Spanish - español',
                            rtl: false,
                        },
                        {
                            locale: 'pt-BR',
                            name: 'Português (Brasil)',
                            native_name: 'português (Brasil)',
                            presentation_name: 'Portuguese (Brazil) - português (Brasil)',
                            rtl: false,
                        },
                    ],
                }),
            )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'locales'])

        const output = consoleSpy.mock.calls.map((call: [string]) => call[0]).join('\n')
        expect(output).toContain('Default locale: en-us')
        expect(output).toContain('Supported locales:')
        expect(output).toContain('en-us  English [default]')
        expect(output).toContain('es  Español')
        expect(output).toContain('pt-br  Português (Brasil)')
    })

    it('returns structured locale metadata with --json', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: ['en-us', 'ja'],
                    default_locale: 'en-us',
                }),
            )
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: [
                        {
                            locale: 'en-US',
                            name: 'English',
                            native_name: 'English (United States)',
                            presentation_name: 'English (United States)',
                            rtl: false,
                        },
                        {
                            locale: 'ja',
                            name: '日本語 (Japanese)',
                            native_name: '日本語',
                            presentation_name: 'Japanese - 日本語',
                            rtl: false,
                        },
                    ],
                }),
            )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'locales', '--json'])

        expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
            defaultLocale: 'en-us',
            locales: [
                {
                    locale: 'en-us',
                    name: 'English',
                    nativeName: 'English (United States)',
                    presentationName: 'English (United States)',
                    rtl: false,
                    isDefault: true,
                },
                {
                    locale: 'ja',
                    name: '日本語 (Japanese)',
                    nativeName: '日本語',
                    presentationName: 'Japanese - 日本語',
                    rtl: false,
                    isDefault: false,
                },
            ],
        })
    })

    it('views a raw article id and renders markdown output', async () => {
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                article: {
                    id: 360000269065,
                    title: 'Manage your notifications in Todoist',
                    html_url:
                        'https://get.todoist.help/hc/en-us/articles/360000269065-manage-your-notifications',
                    body: '<p>Turn on <strong>web</strong> notifications.</p>',
                },
            }),
        )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'view', '360000269065'])

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://todoist.zendesk.com/api/v2/help_center/en-us/articles/360000269065',
        )

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).toContain('# Manage your notifications in Todoist')
        expect(output).toContain('Source: https://get.todoist.help/hc/en-us/articles/360000269065')
        expect(output).toContain('Turn on **web** notifications.')
    })

    it('uses the provided URL directly for browser mode', async () => {
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'hc',
            'view',
            'https://get.todoist.help/hc/en-us/articles/360000269065-manage-your-notifications',
            '--browser',
        ])

        expect(openInBrowser).toHaveBeenCalledWith(
            'https://get.todoist.help/hc/en-us/articles/360000269065-manage-your-notifications',
        )
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('opens the marketing URL directly in --browser mode without resolving', async () => {
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'hc',
            'view',
            'https://www.todoist.com/help/articles/introduction-to-filters-V98wIH',
            '--browser',
        ])

        expect(openInBrowser).toHaveBeenCalledWith(
            'https://www.todoist.com/help/articles/introduction-to-filters-V98wIH',
        )
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('resolves a www.todoist.com marketing URL via search and fetches the article', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                createJsonResponse({
                    count: 2,
                    results: [
                        {
                            id: 26646901023644,
                            title: 'Todoist glossary',
                            html_url:
                                'https://get.todoist.help/hc/en-us/articles/26646901023644-Todoist-glossary',
                        },
                        {
                            id: 205248842,
                            title: 'Introduction to filters',
                            html_url:
                                'https://get.todoist.help/hc/en-us/articles/205248842-Introduction-to-filters',
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createJsonResponse({
                    article: {
                        id: 205248842,
                        title: 'Introduction to filters',
                        html_url:
                            'https://get.todoist.help/hc/en-us/articles/205248842-Introduction-to-filters',
                        body: '<p>Filters help you...</p>',
                    },
                }),
            )

        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'hc',
            'view',
            'https://www.todoist.com/help/articles/introduction-to-filters-V98wIH',
        ])

        expect(fetchSpy).toHaveBeenCalledTimes(2)
        expect(String(fetchSpy.mock.calls[0][0])).toContain(
            '/api/v2/help_center/articles/search?query=introduction-to-filters-V98wIH&locale=en-us&per_page=10',
        )
        expect(fetchSpy.mock.calls[1][0]).toBe(
            'https://todoist.zendesk.com/api/v2/help_center/en-us/articles/205248842',
        )

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).toContain('# Introduction to filters')
        expect(output).toContain('Filters help you')
    })

    it('errors when the marketing URL slug cannot be matched', async () => {
        fetchSpy.mockResolvedValueOnce(
            createJsonResponse({
                count: 1,
                results: [
                    {
                        id: 999,
                        title: 'Something else',
                        html_url: 'https://get.todoist.help/hc/en-us/articles/999-Something-else',
                    },
                ],
            }),
        )

        const program = createProgram()
        await expect(
            program.parseAsync([
                'node',
                'td',
                'hc',
                'view',
                'https://www.todoist.com/help/articles/introduction-to-filters-V98wIH',
            ]),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('outputs the raw HTML body with --html', async () => {
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                article: {
                    id: 205348301,
                    title: 'Set reminders for your tasks',
                    html_url: 'https://get.todoist.help/hc/en-us/articles/205348301-set-reminders',
                    body: '<p>Full <strong>HTML</strong> body.</p>',
                },
            }),
        )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'view', 'id:205348301', '--html'])

        expect(stdoutSpy).toHaveBeenCalledWith('<p>Full <strong>HTML</strong> body.</p>')
        stdoutSpy.mockRestore()
    })

    it('returns normalized article JSON with --json', async () => {
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                article: {
                    id: 205348301,
                    title: 'Set reminders for your tasks',
                    html_url: 'https://get.todoist.help/hc/en-us/articles/205348301-set-reminders',
                    body: '<p>Full article body</p>',
                    updated_at: '2025-11-28T00:27:28Z',
                    label_names: ['notification', 'reminders'],
                },
            }),
        )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'view', '205348301', '--json'])

        expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
            id: '205348301',
            title: 'Set reminders for your tasks',
            htmlUrl: 'https://get.todoist.help/hc/en-us/articles/205348301-set-reminders',
            bodyHtml: '<p>Full article body</p>',
            updatedAt: '2025-11-28T00:27:28Z',
            labelNames: ['notification', 'reminders'],
            locale: 'en-us',
        })
    })

    it('errors on conflicting output modes', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'hc', 'view', '205348301', '--json', '--browser']),
        ).rejects.toMatchObject({
            code: 'CONFLICTING_OPTIONS',
        })
    })

    it('persists a supported locale as the default via hc locale --set-default', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: ['en-us', 'es', 'pt-br'],
                    default_locale: 'en-us',
                }),
            )
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: [
                        { locale: 'en-US', name: 'English', rtl: false },
                        { locale: 'es', name: 'Español', rtl: false },
                        { locale: 'pt-BR', name: 'Português (Brasil)', rtl: false },
                    ],
                }),
            )
        mockReadConfig.mockResolvedValue({ update_channel: 'stable' })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'locale', '--set-default', 'PT-BR'])

        expect(mockWriteConfig).toHaveBeenCalledWith({
            update_channel: 'stable',
            hc: { defaultLocale: 'pt-br' },
        })
        const output = consoleSpy.mock.calls
            .map((call: unknown[]) => call.map(String).join(' '))
            .join('\n')
        expect(output).toContain('Default Help Center locale set to')
        expect(output).toContain('pt-br')
    })

    it('replaces a malformed hc config block with a clean object on --set-default', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: ['en-us', 'pt-br'],
                    default_locale: 'en-us',
                }),
            )
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: [
                        { locale: 'en-US', name: 'English', rtl: false },
                        { locale: 'pt-BR', name: 'Português (Brasil)', rtl: false },
                    ],
                }),
            )
        mockReadConfig.mockResolvedValue({
            hc: 'oops' as unknown as { defaultLocale?: string },
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'locale', '--set-default', 'pt-br'])

        expect(mockWriteConfig).toHaveBeenCalledWith({
            hc: { defaultLocale: 'pt-br' },
        })
    })

    it('rejects an unsupported locale with an INVALID_OPTIONS error listing supported codes', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: ['en-us', 'es'],
                    default_locale: 'en-us',
                }),
            )
            .mockResolvedValueOnce(
                createJsonResponse({
                    locales: [
                        { locale: 'en-US', name: 'English', rtl: false },
                        { locale: 'es', name: 'Español', rtl: false },
                    ],
                }),
            )

        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'hc', 'locale', '--set-default', 'xx-yy']),
        ).rejects.toMatchObject({
            code: 'INVALID_OPTIONS',
            hints: expect.arrayContaining([expect.stringContaining('en-us')]),
        })
        expect(mockWriteConfig).not.toHaveBeenCalled()
    })

    it('rejects a malformed locale before fetching supported locales', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'hc', 'locale', '--set-default', 'NOT_A_LOCALE']),
        ).rejects.toMatchObject({
            code: 'INVALID_OPTIONS',
        })
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(mockWriteConfig).not.toHaveBeenCalled()
    })

    it('uses the configured default locale for hc search when --locale is omitted', async () => {
        mockReadConfig.mockResolvedValue({ hc: { defaultLocale: 'de' } })
        fetchSpy.mockResolvedValue(createJsonResponse({ results: [] }))

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'search', 'notifications'])

        expect(String(fetchSpy.mock.calls[0][0])).toContain('locale=de')
    })

    it('prefers --locale over the configured default for hc search', async () => {
        mockReadConfig.mockResolvedValue({ hc: { defaultLocale: 'de' } })
        fetchSpy.mockResolvedValue(createJsonResponse({ results: [] }))

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'search', 'notifications', '--locale', 'fr'])

        expect(String(fetchSpy.mock.calls[0][0])).toContain('locale=fr')
    })

    it('prefers the URL locale over the configured default for hc view', async () => {
        mockReadConfig.mockResolvedValue({ hc: { defaultLocale: 'de' } })
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                article: {
                    id: 360000269065,
                    title: 'Article',
                    html_url: 'https://get.todoist.help/hc/fr/articles/360000269065',
                    body: '<p>Body</p>',
                },
            }),
        )

        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'hc',
            'view',
            'https://get.todoist.help/hc/fr/articles/360000269065',
        ])

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://todoist.zendesk.com/api/v2/help_center/fr/articles/360000269065',
        )
    })

    it('falls back to en-us when hc search has an invalid configured default and no --locale', async () => {
        mockReadConfig.mockResolvedValue({ hc: { defaultLocale: 'not-a-locale!' } })
        fetchSpy.mockResolvedValue(createJsonResponse({ results: [] }))

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'search', 'notifications'])

        expect(String(fetchSpy.mock.calls[0][0])).toContain('locale=en-us')
    })

    it('falls back to en-us when hc view has an invalid configured default and a bare id', async () => {
        mockReadConfig.mockResolvedValue({ hc: { defaultLocale: 'not-a-locale!' } })
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                article: { id: 360000269065, title: 'Article', body: '<p>Body</p>' },
            }),
        )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'view', '360000269065'])

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://todoist.zendesk.com/api/v2/help_center/en-us/articles/360000269065',
        )
    })

    it('ignores an invalid configured default when the URL carries a locale', async () => {
        mockReadConfig.mockResolvedValue({ hc: { defaultLocale: 'not-a-locale!' } })
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                article: {
                    id: 360000269065,
                    title: 'Article',
                    html_url: 'https://get.todoist.help/hc/fr/articles/360000269065',
                    body: '<p>Body</p>',
                },
            }),
        )

        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'hc',
            'view',
            'https://get.todoist.help/hc/fr/articles/360000269065',
        ])

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://todoist.zendesk.com/api/v2/help_center/fr/articles/360000269065',
        )
    })

    it('uses the configured default locale for hc view when no URL locale and no flag', async () => {
        mockReadConfig.mockResolvedValue({ hc: { defaultLocale: 'de' } })
        fetchSpy.mockResolvedValue(
            createJsonResponse({
                article: {
                    id: 360000269065,
                    title: 'Artikel',
                    body: '<p>Body</p>',
                },
            }),
        )

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'hc', 'view', '360000269065'])

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://todoist.zendesk.com/api/v2/help_center/de/articles/360000269065',
        )
    })
})

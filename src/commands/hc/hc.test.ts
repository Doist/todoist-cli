import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/browser.js', () => ({
    openInBrowser: vi.fn(),
}))

import { openInBrowser } from '../../lib/browser.js'
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

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)
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
})

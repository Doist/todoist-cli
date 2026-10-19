import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { renderAuthErrorPage, renderAuthSuccessPage } from './auth-html.js'
import { CLI_ICON_URL } from './constants.js'

describe('auth pages', () => {
    it.each([
        ['success', renderAuthSuccessPage()],
        ['error', renderAuthErrorPage('boom')],
    ])('the %s page shows the published icon rather than an inline copy', (_, html) => {
        expect(html).toContain(`<img src="${CLI_ICON_URL}"`)
        expect(html).toContain('referrerpolicy="no-referrer"')
        expect(html).not.toMatch(/<svg[^>]*viewBox="0 0 72 72"/)
    })
})

describe('CLI_ICON_URL', () => {
    it('points at a file in this repo, which published READMEs also use', () => {
        const path = new URL(CLI_ICON_URL).pathname.replace(/^\/Doist\/todoist-cli\/main\//, '')
        expect(existsSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)))).toBe(true)
    })
})

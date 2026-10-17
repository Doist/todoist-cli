import { describe, expect, it } from 'vitest'

import { renderAuthErrorPage, renderAuthSuccessPage } from './auth-html.js'
import { CLI_ICON_URL } from './constants.js'

describe('auth pages', () => {
    it.each([
        ['success', renderAuthSuccessPage()],
        ['error', renderAuthErrorPage('boom')],
    ])('the %s page shows the published icon rather than an inline copy', (_, html) => {
        expect(html).toContain(`<img src="${CLI_ICON_URL}"`)
        expect(html).not.toContain('Size=72, Style=Color')
    })
})

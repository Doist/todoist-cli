import { CliError } from './errors.js'

const HELP_CENTER_SEARCH_URL = 'https://todoist.zendesk.com/api/v2/help_center/articles/search'
const HELP_CENTER_ARTICLE_URL_BASE = 'https://todoist.zendesk.com/api/v2/help_center'
const HELP_CENTER_LOCALES_URL = 'https://todoist.zendesk.com/api/v2/help_center/locales'
const ACCOUNT_LOCALES_URL = 'https://todoist.zendesk.com/api/v2/locales.json'
const HELP_CENTER_LOCALE_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/

export const DEFAULT_HELP_CENTER_LOCALE = 'en-us'
export const DEFAULT_HELP_CENTER_LIMIT = 10
export const MAX_HELP_CENTER_LIMIT = 25

interface RawHelpCenterArticle {
    id?: number | string
    title?: string
    html_url?: string
    snippet?: string
    body?: string
    updated_at?: string
    label_names?: unknown[]
    locale?: string
}

interface RawHelpCenterSearchResponse {
    results?: RawHelpCenterArticle[]
}

interface RawHelpCenterArticleResponse {
    article?: RawHelpCenterArticle
}

interface RawHelpCenterLocalesResponse {
    locales?: string[]
    default_locale?: string
}

interface RawLocaleDefinition {
    locale?: string
    name?: string
    native_name?: string
    presentation_name?: string
    rtl?: boolean
}

interface RawLocalesResponse {
    locales?: RawLocaleDefinition[]
}

export interface HelpCenterSearchResult {
    id: string
    title: string
    htmlUrl: string
    snippet: string
    locale: string
}

export interface HelpCenterArticle {
    id: string
    title: string
    htmlUrl: string
    bodyHtml: string
    updatedAt?: string
    labelNames: string[]
    locale: string
}

export interface HelpCenterLocale {
    locale: string
    name: string
    nativeName?: string
    presentationName?: string
    rtl: boolean
    isDefault: boolean
}

export interface HelpCenterLocales {
    defaultLocale: string
    locales: HelpCenterLocale[]
}

export interface ResolveHelpCenterRefOptions {
    locale?: string
}

export interface ResolvedHelpCenterRef {
    articleId: string
    locale: string
    htmlUrl?: string
    source: 'id' | 'url'
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
    amp: '&',
    apos: "'",
    copy: '©',
    gt: '>',
    hellip: '...',
    ldquo: '"',
    lsquo: "'",
    lt: '<',
    mdash: '--',
    nbsp: ' ',
    ndash: '-',
    quot: '"',
    rdquo: '"',
    rsquo: "'",
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
}

function tightenPunctuationSpacing(value: string): string {
    return value.replace(/\s+([,.;:!?])/g, '$1')
}

function normalizeMarkdownWhitespace(value: string): string {
    return tightenPunctuationSpacing(
        value
            .replace(/\r/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim(),
    )
}

function removeHtmlTags(value: string): string {
    return value.replace(/<[^>]+>/g, ' ')
}

function getArticleFallbackUrl(locale: string, articleId: string): string {
    return `https://get.todoist.help/hc/${locale}/articles/${articleId}`
}

function normalizeArticleId(value: string): string {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
        throw new CliError('INVALID_REF', `Invalid Help Center reference "${value}".`, [
            'Use `id:360000269065`, a raw numeric article ID, or a Help Center URL.',
        ])
    }
    return trimmed
}

async function fetchHelpCenterJson<T>(url: string): Promise<{ response: Response; data: T }> {
    let response: Response
    try {
        response = await fetch(url)
    } catch (error) {
        throw new CliError('FETCH_FAILED', `Help Center request failed: ${errorMessage(error)}`)
    }

    let data: T
    try {
        data = (await response.json()) as T
    } catch (error) {
        throw new CliError(
            'FETCH_FAILED',
            `Help Center request returned invalid JSON: ${errorMessage(error)}`,
        )
    }

    return { response, data }
}

function renderInlineHtml(fragment: string): string {
    let rendered = fragment
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')

    rendered = rendered.replace(
        /<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
        (_match, _quote: string, href: string, inner: string) => {
            const label = renderInlineHtml(inner).replace(/\n+/g, ' ').trim()
            const cleanHref = decodeHtmlEntities(href)
            return label ? `[${label}](${cleanHref})` : cleanHref
        },
    )

    rendered = rendered.replace(
        /<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
        (_match, _tag: string, inner: string) => {
            const value = renderInlineHtml(inner).replace(/\n+/g, ' ').trim()
            return value ? `**${value}**` : ''
        },
    )

    rendered = rendered.replace(
        /<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi,
        (_match, _tag: string, inner: string) => {
            const value = renderInlineHtml(inner).replace(/\n+/g, ' ').trim()
            return value ? `*${value}*` : ''
        },
    )

    rendered = rendered.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, inner: string) => {
        const value = collapseWhitespace(decodeHtmlEntities(removeHtmlTags(inner)))
        return value ? `\`${value}\`` : ''
    })

    rendered = rendered.replace(/<[^>]+>/g, '')
    rendered = decodeHtmlEntities(rendered)
    rendered = rendered.replace(/\u00a0/g, ' ')
    rendered = rendered.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
    return tightenPunctuationSpacing(rendered.replace(/[ \t]{2,}/g, ' '))
}

function renderList(kind: 'ol' | 'ul', inner: string): string {
    let index = 0
    const items = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    if (items.length === 0) {
        return htmlToMarkdown(inner)
    }

    return items
        .map((match) => {
            index += 1
            const itemHtml = match[1]
            const body =
                /<(p|div|section|article|header|footer|aside|ul|ol|blockquote|pre|h[1-6])\b/i.test(
                    itemHtml,
                )
                    ? htmlToMarkdown(itemHtml).trim()
                    : renderInlineHtml(itemHtml).trim()
            if (!body) return ''

            const lines = body.split('\n')
            const marker = kind === 'ol' ? `${index}.` : '-'
            return [marker + ' ' + lines[0], ...lines.slice(1).map((line) => `  ${line}`)].join(
                '\n',
            )
        })
        .filter(Boolean)
        .join('\n')
}

function normalizeRawLocale(rawLocale: string | undefined, fallbackLocale: string): string {
    if (!rawLocale) return fallbackLocale
    try {
        return normalizeHelpCenterLocale(rawLocale)
    } catch {
        return fallbackLocale
    }
}

function normalizeSearchResult(
    rawResult: RawHelpCenterArticle,
    fallbackLocale: string,
): HelpCenterSearchResult | null {
    if (rawResult.id === undefined || rawResult.id === null || !rawResult.title) {
        return null
    }

    const articleId = String(rawResult.id)
    const locale = normalizeRawLocale(rawResult.locale, fallbackLocale)
    return {
        id: articleId,
        title: rawResult.title,
        htmlUrl: rawResult.html_url || getArticleFallbackUrl(locale, articleId),
        snippet: sanitizeHelpCenterSnippet(rawResult.snippet ?? ''),
        locale,
    }
}

function normalizeLocaleDefinition(rawLocale: RawLocaleDefinition): HelpCenterLocale | null {
    if (!rawLocale.locale) {
        return null
    }

    return {
        locale: String(rawLocale.locale).toLowerCase(),
        name: rawLocale.name || String(rawLocale.locale),
        nativeName: rawLocale.native_name,
        presentationName: rawLocale.presentation_name,
        rtl: rawLocale.rtl ?? false,
        isDefault: false,
    }
}

function normalizeArticle(
    rawArticle: RawHelpCenterArticle,
    fallbackLocale: string,
    requestedArticleId: string,
): HelpCenterArticle {
    const locale = normalizeRawLocale(rawArticle.locale, fallbackLocale)
    const articleId =
        rawArticle.id !== undefined && rawArticle.id !== null
            ? String(rawArticle.id)
            : requestedArticleId

    return {
        id: articleId,
        title: rawArticle.title || `Article ${articleId}`,
        htmlUrl: rawArticle.html_url || getArticleFallbackUrl(locale, articleId),
        bodyHtml: rawArticle.body ?? '',
        updatedAt: rawArticle.updated_at,
        labelNames: Array.isArray(rawArticle.label_names)
            ? rawArticle.label_names
                  .map((value) => (typeof value === 'string' ? value : null))
                  .filter((value): value is string => Boolean(value))
            : [],
        locale,
    }
}

export function normalizeHelpCenterLocale(locale = DEFAULT_HELP_CENTER_LOCALE): string {
    const normalized = locale.trim().toLowerCase()
    if (!HELP_CENTER_LOCALE_PATTERN.test(normalized)) {
        throw new CliError('INVALID_OPTIONS', `Invalid Help Center locale "${locale}".`, [
            'Use values like `en-us`, `es`, `de`, `fr`, `ja`, or `pt-br`.',
        ])
    }
    return normalized
}

export function parseHelpCenterLimit(limit: number | string | undefined): number {
    if (limit === undefined) return DEFAULT_HELP_CENTER_LIMIT

    const parsed = typeof limit === 'number' ? limit : Number.parseInt(String(limit).trim(), 10)

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_HELP_CENTER_LIMIT) {
        throw new CliError(
            'INVALID_OPTIONS',
            `Option --limit must be an integer between 1 and ${MAX_HELP_CENTER_LIMIT}.`,
            ['Example: `td hc search "notifications" --limit 5`'],
        )
    }

    return parsed
}

export function decodeHtmlEntities(value: string): string {
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, raw) => {
        const token = String(raw)
        if (token.startsWith('#x') || token.startsWith('#X')) {
            const codePoint = Number.parseInt(token.slice(2), 16)
            return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint)
        }
        if (token.startsWith('#')) {
            const codePoint = Number.parseInt(token.slice(1), 10)
            return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint)
        }

        const decoded = NAMED_HTML_ENTITIES[token.toLowerCase()]
        return decoded ?? entity
    })
}

export function sanitizeHelpCenterSnippet(snippet: string): string {
    return tightenPunctuationSpacing(
        collapseWhitespace(decodeHtmlEntities(removeHtmlTags(snippet))),
    )
}

export function htmlToMarkdown(html: string): string {
    let rendered = html
        .replace(/\r/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')

    rendered = rendered.replace(
        /<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
        (_match, inner: string) => {
            const code = decodeHtmlEntities(removeHtmlTags(inner)).trim()
            return code ? `\n\n\`\`\`\n${code}\n\`\`\`\n\n` : '\n\n'
        },
    )

    rendered = rendered.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, inner: string) => {
        const code = decodeHtmlEntities(removeHtmlTags(inner)).trim()
        return code ? `\n\n\`\`\`\n${code}\n\`\`\`\n\n` : '\n\n'
    })

    rendered = rendered.replace(
        /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
        (_match, inner: string) => {
            const body = htmlToMarkdown(inner)
            if (!body) return '\n\n'
            return (
                '\n\n' +
                body
                    .split('\n')
                    .map((line) => (line ? `> ${line}` : '>'))
                    .join('\n') +
                '\n\n'
            )
        },
    )

    rendered = rendered.replace(
        /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
        (_match, level: string, inner: string) => {
            const heading = renderInlineHtml(inner).replace(/\n+/g, ' ').trim()
            return heading ? `\n\n${'#'.repeat(Number(level))} ${heading}\n\n` : '\n\n'
        },
    )

    rendered = rendered.replace(
        /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi,
        (_match, kind: string, inner: string) => {
            const list = renderList(kind.toLowerCase() as 'ol' | 'ul', inner)
            return list ? `\n\n${list}\n\n` : '\n\n'
        },
    )

    rendered = rendered.replace(
        /<(p|div|section|article|header|footer|aside)[^>]*>([\s\S]*?)<\/\1>/gi,
        (_match, _tag: string, inner: string) => {
            const body = renderInlineHtml(inner).trim()
            return body ? `\n\n${body}\n\n` : '\n\n'
        },
    )

    rendered = rendered.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => {
        const body = renderInlineHtml(inner).trim()
        return body ? `\n- ${body}\n` : '\n'
    })

    rendered = rendered.replace(/<br\s*\/?>/gi, '\n')
    rendered = rendered.replace(/<[^>]+>/g, '')
    rendered = decodeHtmlEntities(rendered).replace(/\u00a0/g, ' ')

    return normalizeMarkdownWhitespace(rendered)
}

export function formatHelpCenterArticleMarkdown(article: HelpCenterArticle): string {
    const lines = [`# ${article.title}`, '', `Source: ${article.htmlUrl}`]
    const body = htmlToMarkdown(article.bodyHtml)

    if (body) {
        lines.push('', body)
    }

    return lines.join('\n').trim()
}

export function parseHelpCenterArticleUrl(
    ref: string,
): { articleId: string; locale?: string; htmlUrl: string } | null {
    let url: URL
    try {
        url = new URL(ref)
    } catch {
        return null
    }

    const hostname = url.hostname.toLowerCase()
    if (hostname !== 'get.todoist.help' && hostname !== 'todoist.zendesk.com') {
        return null
    }

    const htmlMatch = url.pathname.match(/\/hc\/([^/]+)\/articles\/(\d+)/i)
    if (htmlMatch) {
        return {
            articleId: htmlMatch[2],
            locale: htmlMatch[1].toLowerCase(),
            htmlUrl: url.toString(),
        }
    }

    const apiMatch = url.pathname.match(/\/api\/v2\/help_center\/([^/]+)\/articles\/(\d+)/i)
    if (apiMatch) {
        return {
            articleId: apiMatch[2],
            locale: apiMatch[1].toLowerCase(),
            htmlUrl: getArticleFallbackUrl(apiMatch[1].toLowerCase(), apiMatch[2]),
        }
    }

    return null
}

export async function searchHelpCenter(
    query: string,
    options: { locale?: string; limit?: number | string } = {},
): Promise<HelpCenterSearchResult[]> {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
        throw new CliError('MISSING_NAME', 'Help Center search query is required.', [
            'Example: `td hc search "notifications"`',
        ])
    }

    const locale = normalizeHelpCenterLocale(options.locale)
    const limit = parseHelpCenterLimit(options.limit)
    const url = new URL(HELP_CENTER_SEARCH_URL)
    url.searchParams.set('query', trimmedQuery)
    url.searchParams.set('locale', locale)
    url.searchParams.set('per_page', String(limit))

    const { response, data } = await fetchHelpCenterJson<RawHelpCenterSearchResponse>(
        url.toString(),
    )
    if (!response.ok) {
        throw new CliError(
            'FETCH_FAILED',
            `Failed to search the Help Center: ${response.status} ${response.statusText}`,
        )
    }

    return (data.results ?? [])
        .map((result) => normalizeSearchResult(result, locale))
        .filter((result): result is HelpCenterSearchResult => Boolean(result))
}

export async function getHelpCenterArticle(
    articleId: string,
    options: { locale?: string } = {},
): Promise<HelpCenterArticle> {
    const normalizedArticleId = normalizeArticleId(articleId)
    const locale = normalizeHelpCenterLocale(options.locale)
    const url = `${HELP_CENTER_ARTICLE_URL_BASE}/${locale}/articles/${normalizedArticleId}`

    const { response, data } = await fetchHelpCenterJson<RawHelpCenterArticleResponse>(url)
    if (response.status === 404) {
        throw new CliError('NOT_FOUND', `Help Center article ${normalizedArticleId} not found.`)
    }
    if (!response.ok) {
        throw new CliError(
            'FETCH_FAILED',
            `Failed to fetch Help Center article ${normalizedArticleId}: ${response.status} ${response.statusText}`,
        )
    }
    if (!data.article) {
        throw new CliError(
            'FETCH_FAILED',
            `Help Center article ${normalizedArticleId} returned an invalid response.`,
        )
    }

    return normalizeArticle(data.article, locale, normalizedArticleId)
}

export async function getHelpCenterLocales(): Promise<HelpCenterLocales> {
    const { response, data } =
        await fetchHelpCenterJson<RawHelpCenterLocalesResponse>(HELP_CENTER_LOCALES_URL)
    if (!response.ok) {
        throw new CliError(
            'FETCH_FAILED',
            `Failed to fetch Help Center locales: ${response.status} ${response.statusText}`,
        )
    }

    const defaultLocale = normalizeHelpCenterLocale(
        data.default_locale ?? DEFAULT_HELP_CENTER_LOCALE,
    )
    const supportedLocales = Array.isArray(data.locales)
        ? data.locales.map((locale) => normalizeHelpCenterLocale(locale))
        : []

    let localeDetails = new Map<string, HelpCenterLocale>()
    try {
        const detailResult = await fetchHelpCenterJson<RawLocalesResponse>(ACCOUNT_LOCALES_URL)
        if (detailResult.response.ok && Array.isArray(detailResult.data.locales)) {
            localeDetails = new Map(
                detailResult.data.locales
                    .map((locale) => normalizeLocaleDefinition(locale))
                    .filter((locale): locale is HelpCenterLocale => Boolean(locale))
                    .map((locale) => [locale.locale, locale]),
            )
        }
    } catch {
        // Fallback to bare locale codes when the enrichment endpoint is unavailable.
    }

    return {
        defaultLocale,
        locales: supportedLocales.map((locale) => {
            const detail = localeDetails.get(locale)
            return {
                locale,
                name: detail?.name ?? locale,
                nativeName: detail?.nativeName,
                presentationName: detail?.presentationName,
                rtl: detail?.rtl ?? false,
                isDefault: locale === defaultLocale,
            }
        }),
    }
}

export function resolveHelpCenterRef(
    ref: string,
    options: ResolveHelpCenterRefOptions = {},
): ResolvedHelpCenterRef {
    const trimmed = ref.trim()
    if (!trimmed) {
        throw new CliError('INVALID_REF', 'Help Center article reference is required.', [
            'Use an article ID or a Help Center URL.',
        ])
    }

    const explicitLocale = options.locale ? normalizeHelpCenterLocale(options.locale) : undefined
    const urlRef = parseHelpCenterArticleUrl(trimmed)
    if (urlRef) {
        return {
            articleId: urlRef.articleId,
            locale: explicitLocale ?? urlRef.locale ?? DEFAULT_HELP_CENTER_LOCALE,
            htmlUrl: urlRef.htmlUrl,
            source: 'url',
        }
    }

    if (trimmed.startsWith('id:')) {
        const articleId = normalizeArticleId(trimmed.slice(3))
        return {
            articleId,
            locale: explicitLocale ?? DEFAULT_HELP_CENTER_LOCALE,
            source: 'id',
        }
    }

    if (/^[1-9]\d*$/.test(trimmed)) {
        return {
            articleId: trimmed,
            locale: explicitLocale ?? DEFAULT_HELP_CENTER_LOCALE,
            source: 'id',
        }
    }

    throw new CliError('INVALID_REF', `Invalid Help Center reference "${ref}".`, [
        'Use `id:360000269065`, a raw numeric article ID, or a Help Center URL.',
    ])
}

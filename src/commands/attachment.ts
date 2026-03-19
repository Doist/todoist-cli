import { Command } from 'commander'
import { getApi } from '../lib/api/core.js'
import { formatFileSize } from '../lib/output.js'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
])

const TEXT_MIME_TYPES = new Set([
    'text/plain',
    'text/csv',
    'text/html',
    'text/markdown',
    'application/json',
    'application/xml',
    'text/xml',
])

const EXTENSION_TO_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
}

function parseMimeType(contentType: string): string {
    const base = contentType.split(';')[0]
    return (base ?? contentType).trim().toLowerCase()
}

function getMimeTypeFromUrl(url: string): string | undefined {
    try {
        const pathname = new URL(url).pathname
        const lastDot = pathname.lastIndexOf('.')
        if (lastDot === -1) return undefined
        const ext = pathname.slice(lastDot).toLowerCase()
        return EXTENSION_TO_MIME[ext]
    } catch {
        return undefined
    }
}

function getFileNameFromUrl(url: string): string | undefined {
    try {
        const pathname = new URL(url).pathname
        const lastSlash = pathname.lastIndexOf('/')
        if (lastSlash === -1) return undefined
        const name = pathname.slice(lastSlash + 1)
        return name || undefined
    } catch {
        return undefined
    }
}

function getContentCategory(mimeType: string): 'text' | 'image' | 'binary' {
    if (IMAGE_MIME_TYPES.has(mimeType)) return 'image'
    if (TEXT_MIME_TYPES.has(mimeType) || mimeType.startsWith('text/')) return 'text'
    return 'binary'
}

interface ViewOptions {
    json?: boolean
}

async function viewAttachment(url: string, options: ViewOptions): Promise<void> {
    const api = await getApi()
    const response = await api.viewAttachment(url)

    if (!response.ok) {
        throw new Error(`Failed to fetch attachment: ${response.status} ${response.statusText}`)
    }

    const fileName = getFileNameFromUrl(url) ?? 'unknown'

    // Determine MIME type from Content-Type header, fall back to URL extension
    const rawContentType = response.headers['content-type']
    const headerMime = rawContentType ? parseMimeType(rawContentType) : undefined
    const mimeType =
        headerMime && headerMime !== 'application/octet-stream'
            ? headerMime
            : (getMimeTypeFromUrl(url) ?? headerMime ?? 'application/octet-stream')

    // Check content-length header before reading body
    const contentLength = response.headers['content-length']
    const headerFileSize = contentLength ? Number.parseInt(contentLength, 10) : undefined
    if (headerFileSize && headerFileSize > MAX_FILE_SIZE) {
        throw new Error(
            `Attachment "${fileName}" is too large (${formatFileSize(headerFileSize)}, limit is ${formatFileSize(MAX_FILE_SIZE)})`,
        )
    }

    const category = getContentCategory(mimeType)

    // Read content based on category
    let content: string
    let encoding: 'utf-8' | 'base64'
    let fileSize: number

    if (category === 'text') {
        const text = await response.text()
        fileSize = Buffer.byteLength(text, 'utf-8')
        if (fileSize > MAX_FILE_SIZE) {
            throw new Error(
                `Attachment "${fileName}" is too large (${formatFileSize(fileSize)}, limit is ${formatFileSize(MAX_FILE_SIZE)})`,
            )
        }
        content = text
        encoding = 'utf-8'
    } else {
        const buffer = Buffer.from(await response.arrayBuffer())
        fileSize = buffer.byteLength
        if (fileSize > MAX_FILE_SIZE) {
            throw new Error(
                `Attachment "${fileName}" is too large (${formatFileSize(fileSize)}, limit is ${formatFileSize(MAX_FILE_SIZE)})`,
            )
        }
        content = buffer.toString('base64')
        encoding = 'base64'
    }

    if (options.json) {
        console.log(
            JSON.stringify(
                {
                    fileName,
                    fileSize,
                    contentType: mimeType,
                    contentCategory: category,
                    encoding,
                    content,
                },
                null,
                2,
            ),
        )
        return
    }

    // Default mode: metadata to stderr, content to stdout
    process.stderr.write(`Attachment: ${fileName} (${mimeType}, ${formatFileSize(fileSize)})\n`)
    if (encoding === 'base64') {
        process.stderr.write('Encoding: base64\n')
    }
    console.log(content)
}

export function registerAttachmentCommand(program: Command): void {
    const attachment = program.command('attachment').description('Manage file attachments')

    attachment
        .command('view [url]', { isDefault: true })
        .description('View/download a file attachment by URL')
        .option('--json', 'Output as JSON with metadata and content')
        .action((url, options) => {
            if (!url) {
                attachment.help()
                return
            }
            return viewAttachment(url, options)
        })
}

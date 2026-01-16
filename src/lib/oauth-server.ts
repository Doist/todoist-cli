import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http'

const PORT = 8765
const TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

interface CallbackResult {
    code: string
    state: string
}

const SUCCESS_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Todoist CLI - Authenticated</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .checkmark { font-size: 3rem; color: #4caf50; }
        h1 { color: #333; margin: 1rem 0; }
        p { color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="checkmark">✓</div>
        <h1>Successfully authenticated!</h1>
        <p>You can close this window and return to the terminal.</p>
    </div>
</body>
</html>
`

const ERROR_HTML = (message: string) => `
<!DOCTYPE html>
<html>
<head>
    <title>Todoist CLI - Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .error { font-size: 3rem; color: #f44336; }
        h1 { color: #333; margin: 1rem 0; }
        p { color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="error">✗</div>
        <h1>Authentication failed</h1>
        <p>${message}</p>
    </div>
</body>
</html>
`

export function startCallbackServer(expectedState: string): {
    promise: Promise<string>
    cleanup: () => void
} {
    let server: Server | null = null
    let timeoutId: NodeJS.Timeout | null = null

    const cleanup = () => {
        if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
        }
        if (server) {
            server.close()
            server = null
        }
    }

    const promise = new Promise<string>((resolve, reject) => {
        const handleRequest = (req: IncomingMessage, res: ServerResponse) => {
            const url = new URL(req.url || '/', `http://localhost:${PORT}`)

            if (url.pathname !== '/callback') {
                res.writeHead(404)
                res.end('Not found')
                return
            }

            const code = url.searchParams.get('code')
            const state = url.searchParams.get('state')
            const error = url.searchParams.get('error')

            if (error) {
                res.writeHead(400, { 'Content-Type': 'text/html' })
                res.end(ERROR_HTML(error))
                cleanup()
                reject(new Error(`OAuth error: ${error}`))
                return
            }

            if (!code || !state) {
                res.writeHead(400, { 'Content-Type': 'text/html' })
                res.end(ERROR_HTML('Missing code or state parameter'))
                cleanup()
                reject(new Error('Missing code or state parameter'))
                return
            }

            if (state !== expectedState) {
                res.writeHead(400, { 'Content-Type': 'text/html' })
                res.end(ERROR_HTML('Invalid state parameter (possible CSRF attack)'))
                cleanup()
                reject(new Error('Invalid state parameter'))
                return
            }

            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(SUCCESS_HTML)
            cleanup()
            resolve(code)
        }

        server = createServer(handleRequest)

        server.on('error', (err) => {
            cleanup()
            reject(err)
        })

        server.listen(PORT, () => {
            timeoutId = setTimeout(() => {
                cleanup()
                reject(new Error('OAuth callback timed out'))
            }, TIMEOUT_MS)
        })
    })

    return { promise, cleanup }
}

export const OAUTH_REDIRECT_URI = `http://localhost:${PORT}/callback`

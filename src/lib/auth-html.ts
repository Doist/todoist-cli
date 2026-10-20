/**
 * Branded HTML pages served by the OAuth callback server. Wired into
 * cli-core's `registerAuthCommand` via the `renderSuccess` / `renderError`
 * options so the runtime stays generic while the CLI keeps its branding.
 *
 * The two consts (SUCCESS_HTML / ERROR_HTML) were lifted verbatim from the
 * pre-cli-core `src/lib/oauth-server.ts` to preserve the existing UX.
 */

import { CLI_ICON_URL } from './constants.js'

// The README's PNG, so the icon lives in one file rather than an inline copy.
const TODOIST_CLI_ICON = `<img src="${CLI_ICON_URL}" width="72" height="72" alt="" referrerpolicy="no-referrer">`

const SUCCESS_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connected - Todoist CLI</title>
    <style>
        :root {
            --bg: #fafaf8;
            --surface: #ffffff;
            --border: rgba(0, 0, 0, 0.07);
            --text: #1d1d1f;
            --text-secondary: #6e6e73;
            --text-muted: #aeaeb2;
            --todoist-red: #e44332;
            --todoist-red-soft: rgba(228, 67, 50, 0.06);
            --green: #058527;
            --terminal-bg: #1a1b26;
            --terminal-text: #c0caf5;
            --terminal-muted: #565f89;
            --terminal-green: #9ece6a;
            --radius: 16px;
            --radius-sm: 10px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
            --shadow: 0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
        }
        body::before {
            content: '';
            position: fixed;
            top: -200px;
            left: 50%;
            transform: translateX(-50%);
            width: 800px;
            height: 500px;
            background: radial-gradient(ellipse, rgba(228, 67, 50, 0.07) 0%, transparent 70%);
            pointer-events: none;
        }
        .container {
            max-width: 480px;
            width: 100%;
            margin: 0 auto;
            padding: 48px 24px;
            animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            text-align: center;
            margin-bottom: 32px;
        }
        .logo-wrap {
            width: 72px;
            height: 72px;
            margin: 0 auto 20px;
            position: relative;
        }
        .logo-wrap img,
        .logo-wrap svg {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
        }
        .badge {
            position: absolute;
            bottom: -4px;
            right: -4px;
            width: 26px;
            height: 26px;
            background: var(--green);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 0 3px var(--bg), 0 2px 8px rgba(5, 133, 39, 0.3);
            animation: pop 0.35s ease-out 0.3s both;
        }
        @keyframes pop {
            from { transform: scale(0); }
            70% { transform: scale(1.15); }
            to { transform: scale(1); }
        }
        .badge svg { width: 14px; height: 14px; color: white; }
        h1 {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 4px;
        }
        .subtitle { font-size: 15px; color: var(--text-secondary); }
        .terminal {
            background: var(--terminal-bg);
            border-radius: var(--radius);
            overflow: hidden;
            margin-bottom: 16px;
            box-shadow: var(--shadow);
        }
        .terminal-bar {
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .dots { display: flex; gap: 6px; }
        .dot { width: 12px; height: 12px; border-radius: 50%; }
        .dot-r { background: #ff5f57; }
        .dot-y { background: #febc2e; }
        .dot-g { background: #28c840; }
        .terminal-title {
            flex: 1;
            text-align: center;
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 11px;
            color: var(--terminal-muted);
            margin-right: 48px;
        }
        .terminal-body { padding: 16px 20px; }
        .line {
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 13px;
            margin-bottom: 8px;
            line-height: 1.5;
            color: var(--terminal-text);
        }
        .line:last-child { margin-bottom: 0; }
        .ps { color: var(--todoist-red); user-select: none; font-weight: 500; }
        .arg { color: var(--terminal-green); }
        .out {
            color: var(--terminal-muted);
            padding-left: 18px;
            margin-top: -4px;
            margin-bottom: 8px;
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
        }
        .out-ok { color: var(--terminal-green); }
        .cursor {
            display: inline-block;
            width: 8px;
            height: 16px;
            background: var(--todoist-red);
            border-radius: 1px;
            animation: blink 1.2s step-end infinite;
        }
        @keyframes blink {
            0%, 50% { opacity: 1; }
            50.01%, 100% { opacity: 0; }
        }
        .info {
            padding: 16px 18px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            display: flex;
            gap: 14px;
            align-items: flex-start;
            box-shadow: var(--shadow-sm);
        }
        .info-icon {
            flex-shrink: 0;
            width: 34px;
            height: 34px;
            background: var(--todoist-red-soft);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .info-icon svg { width: 16px; height: 16px; color: var(--todoist-red); }
        .info-text h4 { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
        .info-text p { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .info-text code {
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
            background: var(--todoist-red-soft);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--todoist-red);
        }
        footer {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            color: var(--text-muted);
        }
        .pill {
            display: inline-block;
            padding: 8px 14px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 999px;
            box-shadow: var(--shadow-sm);
        }
        .gh { margin-top: 10px; }
        .gh a {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 12px;
            transition: color 0.2s;
        }
        .gh a:hover { color: var(--todoist-red); }
        .gh svg { width: 14px; height: 14px; }
        @media (max-width: 480px) {
            .container { padding: 32px 16px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="logo-wrap">
                ${TODOIST_CLI_ICON}
                <div class="badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
            </div>
            <h1>You're connected</h1>
            <p class="subtitle">Todoist CLI is now authenticated</p>
        </header>

        <div class="terminal">
            <div class="terminal-bar">
                <div class="dots">
                    <span class="dot dot-r"></span>
                    <span class="dot dot-y"></span>
                    <span class="dot dot-g"></span>
                </div>
                <span class="terminal-title">Terminal</span>
            </div>
            <div class="terminal-body">
                <div class="line">
                    <span class="ps">$</span>
                    <span>td</span>
                    <span class="arg">today</span>
                </div>
                <div class="out out-ok">3 tasks for today</div>
                <div class="line">
                    <span class="ps">$</span>
                    <span>td</span>
                    <span class="arg">add</span>
                    <span>"Review pull request"</span>
                </div>
                <div class="out out-ok">Task added</div>
                <div class="line">
                    <span class="ps">$</span>
                    <span class="cursor"></span>
                </div>
            </div>
        </div>

        <div class="info">
            <div class="info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                </svg>
            </div>
            <div class="info-text">
                <h4>Return to your terminal</h4>
                <p>You can close this window. Run <code>td --help</code> to see available commands.</p>
            </div>
        </div>

        <footer>
            <p class="pill">Closing in <span id="countdown">30</span> seconds...</p>
            <p class="gh">
                <a href="https://github.com/Doist/todoist-cli" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    View on GitHub
                </a>
            </p>
        </footer>
    </div>
    <script>
        let seconds = 30;
        const el = document.getElementById('countdown');
        const t = setInterval(() => {
            if (--seconds > 0) { el.textContent = seconds; }
            else { clearInterval(t); el.parentElement.textContent = 'You can close this window.'; }
        }, 1000);
    </script>
</body>
</html>
`

const ERROR_HTML = (message: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Todoist CLI</title>
    <style>
        :root {
            --bg: #fafaf8;
            --surface: #ffffff;
            --border: rgba(0, 0, 0, 0.07);
            --text: #1d1d1f;
            --text-secondary: #6e6e73;
            --red: #e44332;
            --red-soft: rgba(228, 67, 50, 0.06);
            --radius: 12px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-font-smoothing: antialiased;
        }
        .container {
            text-align: center;
            padding: 48px 24px;
            max-width: 480px;
            animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .logo {
            width: 72px;
            height: 72px;
            margin: 0 auto 20px;
            position: relative;
        }
        .logo img,
        .logo svg {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
        }
        .badge {
            position: absolute;
            bottom: -4px;
            right: -4px;
            width: 26px;
            height: 26px;
            background: var(--red);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 0 3px var(--bg), 0 2px 8px rgba(228, 67, 50, 0.3);
        }
        .badge svg { width: 14px; height: 14px; color: white; }
        h1 {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 6px;
        }
        p { font-size: 15px; color: var(--text-secondary); line-height: 1.6; }
        .hint {
            margin-top: 24px;
            padding: 16px 20px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            font-size: 13px;
            color: var(--text-secondary);
        }
        .hint code {
            font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
            background: var(--red-soft);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--red);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            ${TODOIST_CLI_ICON}
            <div class="badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </div>
        </div>
        <h1>Authentication failed</h1>
        <p>${message}</p>
        <div class="hint">Try again with <code>td auth login</code></div>
    </div>
</body>
</html>
`

export function renderAuthSuccessPage(): string {
    return SUCCESS_HTML
}

export function renderAuthErrorPage(message: string): string {
    return ERROR_HTML(message)
}

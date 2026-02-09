import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http'

const PORT = 8765
const TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

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
        .logo-wrap svg {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 4px 12px rgba(228, 67, 50, 0.2));
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
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M4 0H28C30.2 0 32 1.8 32 4V28C32 30.2 30.2 32 28 32H4C1.8 32 0 30.2 0 28V22.626L.057 22.659C1.422 23.454 4.649 25.333 5.439 25.779C5.917 26.049 6.375 26.043 6.836 25.777C7.112 25.618 10.138 23.876 13.196 22.116L13.271 22.073C16.453 20.242 19.645 18.405 19.786 18.324C20.063 18.164 20.077 17.673 19.767 17.496L19.549 17.372C19.232 17.191 18.822 16.958 18.648 16.855C18.425 16.725 18.023 16.653 17.65 16.867C17.496 16.956 7.149 22.906 6.803 23.102C6.389 23.338 5.877 23.341 5.465 23.102C5.139 22.913 0 19.927 0 19.927V17.234L.057 17.267C1.422 18.062 4.649 19.941 5.439 20.387C5.917 20.657 6.375 20.651 6.836 20.385C7.113 20.226 10.143 18.482 13.203 16.721L13.257 16.69C16.443 14.856 19.645 13.013 19.786 12.932C20.063 12.772 20.077 12.281 19.767 12.104L19.55 11.98C19.233 11.8 18.823 11.566 18.648 11.463C18.425 11.333 18.023 11.261 17.65 11.475C17.496 11.565 7.149 17.514 6.803 17.71C6.389 17.946 5.877 17.949 5.465 17.71C5.139 17.521 0 14.536 0 14.536V11.843L.056 11.875C1.421 12.67 4.648 14.549 5.439 14.996C5.917 15.266 6.375 15.259 6.836 14.993C7.113 14.834 10.148 13.087 13.21 11.325L13.218 11.32C16.418 9.479 19.644 7.622 19.786 7.54C20.063 7.38 20.077 6.889 19.767 6.712L19.549 6.588C19.232 6.408 18.823 6.174 18.648 6.072C18.425 5.942 18.023 5.869 17.65 6.084C17.496 6.173 7.149 12.122 6.803 12.319C6.389 12.554 5.877 12.557 5.465 12.318C5.139 12.13 0 9.144 0 9.144V4C0 1.8 1.8 0 4 0Z" fill="#E44232"/>
                    <path d="M6.836 14.993C7.113 14.834 10.147 13.087 13.21 11.325L13.218 11.32C16.417 9.479 19.644 7.622 19.786 7.54C20.063 7.38 20.077 6.889 19.767 6.712L19.549 6.588C19.233 6.408 18.822 6.174 18.648 6.072C18.424 5.942 18.023 5.869 17.65 6.084C17.496 6.173 7.149 12.122 6.803 12.319C6.389 12.554 5.877 12.557 5.464 12.318C5.139 12.13 0 9.144 0 9.144V11.843L.056 11.875C1.42 12.67 4.648 14.549 5.439 14.996C5.917 15.266 6.375 15.259 6.836 14.993Z" fill="white"/>
                    <path d="M6.836 20.385C7.112 20.226 10.143 18.482 13.203 16.721L13.227 16.707C16.423 14.867 19.644 13.014 19.786 12.932C20.063 12.772 20.077 12.281 19.767 12.104L19.549 11.98C19.233 11.8 18.822 11.566 18.648 11.463C18.424 11.333 18.023 11.261 17.65 11.475C17.496 11.565 7.149 17.514 6.803 17.71C6.389 17.946 5.877 17.949 5.464 17.71C5.139 17.521 0 14.536 0 14.536V17.234L.057 17.267C1.422 18.062 4.648 19.941 5.439 20.387C5.917 20.657 6.375 20.651 6.836 20.385Z" fill="white"/>
                    <path d="M13.211 22.108C10.148 23.871 7.113 25.617 6.836 25.777C6.375 26.043 5.917 26.049 5.439 25.779C4.648 25.333 1.421 23.454.057 22.659L0 22.626V19.927C0 19.927 5.139 22.913 5.464 23.102C5.877 23.341 6.389 23.338 6.803 23.102C7.149 22.906 17.496 16.956 17.65 16.867C18.023 16.653 18.424 16.725 18.648 16.855C18.822 16.958 19.233 17.191 19.549 17.372C19.63 17.417 19.704 17.46 19.767 17.496C20.077 17.673 20.063 18.164 19.786 18.324C19.644 18.406 16.412 20.265 13.211 22.108Z" fill="white"/>
                </svg>
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
        .logo svg {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 4px 12px rgba(228, 67, 50, 0.2));
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
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M4 0H28C30.2 0 32 1.8 32 4V28C32 30.2 30.2 32 28 32H4C1.8 32 0 30.2 0 28V22.626L.057 22.659C1.422 23.454 4.649 25.333 5.439 25.779C5.917 26.049 6.375 26.043 6.836 25.777C7.112 25.618 10.138 23.876 13.196 22.116L13.271 22.073C16.453 20.242 19.645 18.405 19.786 18.324C20.063 18.164 20.077 17.673 19.767 17.496L19.549 17.372C19.232 17.191 18.822 16.958 18.648 16.855C18.425 16.725 18.023 16.653 17.65 16.867C17.496 16.956 7.149 22.906 6.803 23.102C6.389 23.338 5.877 23.341 5.465 23.102C5.139 22.913 0 19.927 0 19.927V17.234L.057 17.267C1.422 18.062 4.649 19.941 5.439 20.387C5.917 20.657 6.375 20.651 6.836 20.385C7.113 20.226 10.143 18.482 13.203 16.721L13.257 16.69C16.443 14.856 19.645 13.013 19.786 12.932C20.063 12.772 20.077 12.281 19.767 12.104L19.55 11.98C19.233 11.8 18.823 11.566 18.648 11.463C18.425 11.333 18.023 11.261 17.65 11.475C17.496 11.565 7.149 17.514 6.803 17.71C6.389 17.946 5.877 17.949 5.465 17.71C5.139 17.521 0 14.536 0 14.536V11.843L.056 11.875C1.421 12.67 4.648 14.549 5.439 14.996C5.917 15.266 6.375 15.259 6.836 14.993C7.113 14.834 10.148 13.087 13.21 11.325L13.218 11.32C16.418 9.479 19.644 7.622 19.786 7.54C20.063 7.38 20.077 6.889 19.767 6.712L19.549 6.588C19.232 6.408 18.823 6.174 18.648 6.072C18.425 5.942 18.023 5.869 17.65 6.084C17.496 6.173 7.149 12.122 6.803 12.319C6.389 12.554 5.877 12.557 5.465 12.318C5.139 12.13 0 9.144 0 9.144V4C0 1.8 1.8 0 4 0Z" fill="#E44232"/>
                <path d="M6.836 14.993C7.113 14.834 10.147 13.087 13.21 11.325L13.218 11.32C16.417 9.479 19.644 7.622 19.786 7.54C20.063 7.38 20.077 6.889 19.767 6.712L19.549 6.588C19.233 6.408 18.822 6.174 18.648 6.072C18.424 5.942 18.023 5.869 17.65 6.084C17.496 6.173 7.149 12.122 6.803 12.319C6.389 12.554 5.877 12.557 5.464 12.318C5.139 12.13 0 9.144 0 9.144V11.843L.056 11.875C1.42 12.67 4.648 14.549 5.439 14.996C5.917 15.266 6.375 15.259 6.836 14.993Z" fill="white"/>
                <path d="M6.836 20.385C7.112 20.226 10.143 18.482 13.203 16.721L13.227 16.707C16.423 14.867 19.644 13.014 19.786 12.932C20.063 12.772 20.077 12.281 19.767 12.104L19.549 11.98C19.233 11.8 18.822 11.566 18.648 11.463C18.424 11.333 18.023 11.261 17.65 11.475C17.496 11.565 7.149 17.514 6.803 17.71C6.389 17.946 5.877 17.949 5.464 17.71C5.139 17.521 0 14.536 0 14.536V17.234L.057 17.267C1.422 18.062 4.648 19.941 5.439 20.387C5.917 20.657 6.375 20.651 6.836 20.385Z" fill="white"/>
                <path d="M13.211 22.108C10.148 23.871 7.113 25.617 6.836 25.777C6.375 26.043 5.917 26.049 5.439 25.779C4.648 25.333 1.421 23.454.057 22.659L0 22.626V19.927C0 19.927 5.139 22.913 5.464 23.102C5.877 23.341 6.389 23.338 6.803 23.102C7.149 22.906 17.496 16.956 17.65 16.867C18.023 16.653 18.424 16.725 18.648 16.855C18.822 16.958 19.233 17.191 19.549 17.372C19.63 17.417 19.704 17.46 19.767 17.496C20.077 17.673 20.063 18.164 19.786 18.324C19.644 18.406 16.412 20.265 13.211 22.108Z" fill="white"/>
            </svg>
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
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(ERROR_HTML(error))
                cleanup()
                reject(new Error(`OAuth error: ${error}`))
                return
            }

            if (!code || !state) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(ERROR_HTML('Missing code or state parameter'))
                cleanup()
                reject(new Error('Missing code or state parameter'))
                return
            }

            if (state !== expectedState) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(ERROR_HTML('Invalid state parameter (possible CSRF attack)'))
                cleanup()
                reject(new Error('Invalid state parameter'))
                return
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
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

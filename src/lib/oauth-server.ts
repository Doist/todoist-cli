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
                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g id="Size=72, Style=Color">
                    <g id="TD CLI">
                    <rect x="3" y="3" width="66" height="66" rx="12" fill="#858585"/>
                    <g id="Terminal" filter="url(#filter0_iiiiiiii_12865_530)">
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="#60514E"/>
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="url(#paint0_radial_12865_530)" fill-opacity="0.8"/>
                    <g id="Todoist">
                    <g id="Todoist_2" filter="url(#filter1_ddii_12865_530)">
                    <path d="M29.1253 11.7083C31.6564 11.7084 33.7082 13.7602 33.7083 16.2913V29.1252C33.7082 31.6563 31.6564 33.7081 29.1253 33.7083H16.2914C13.7603 33.7081 11.7085 31.6563 11.7083 29.1252V27.4036C12.622 27.9356 14.866 29.2315 15.4154 29.5442C15.8157 29.772 16.0904 29.751 16.4681 29.5315C16.8554 29.3064 25.0944 24.5485 25.2894 24.4377C25.4588 24.3416 25.5776 23.9887 25.2845 23.8137C25.0737 23.6878 24.6383 23.4429 24.4876 23.3547C24.3343 23.2653 24.0481 23.1825 23.7406 23.3596C23.6294 23.4236 16.6216 27.4727 16.3841 27.6077C16.0999 27.7692 15.7446 27.7608 15.4613 27.5969C15.2376 27.4674 11.7083 25.4299 11.7083 25.4299V23.595C12.6219 24.1269 14.866 25.4228 15.4154 25.7356C15.8158 25.9636 16.0903 25.9433 16.4681 25.7239C16.8555 25.4987 25.0978 20.7379 25.2894 20.6292C25.4587 20.5328 25.5775 20.181 25.2845 20.0061C25.0737 19.8802 24.6383 19.6343 24.4876 19.5461C24.3342 19.4568 24.0479 19.375 23.7406 19.552C23.6251 19.6185 16.624 23.6627 16.3841 23.7991C16.0998 23.9607 15.7446 23.9523 15.4613 23.7883C15.2353 23.6575 11.7083 21.6223 11.7083 21.6223V19.7874C12.6219 20.3193 14.866 21.6152 15.4154 21.928C15.8157 22.1559 16.0904 22.1357 16.4681 21.9163C16.8555 21.6911 25.0978 16.9303 25.2894 16.8215C25.4588 16.7253 25.5775 16.3725 25.2845 16.1975C25.0736 16.0716 24.6382 15.8266 24.4876 15.7385C24.3342 15.6491 24.048 15.5674 23.7406 15.7444C23.6209 15.8133 16.6219 19.8563 16.3841 19.9915C16.0998 20.1531 15.7446 20.1447 15.4613 19.9807C15.2367 19.8507 11.7217 17.8224 11.7083 17.8147V16.2913C11.7085 13.7602 13.7603 11.7084 16.2914 11.7083H29.1253Z" fill="#ED8278"/>
                    <path d="M29.1253 11.7083C31.6564 11.7084 33.7082 13.7602 33.7083 16.2913V29.1252C33.7082 31.6563 31.6564 33.7081 29.1253 33.7083H16.2914C13.7603 33.7081 11.7085 31.6563 11.7083 29.1252V27.4036C12.622 27.9356 14.866 29.2315 15.4154 29.5442C15.8157 29.772 16.0904 29.751 16.4681 29.5315C16.8554 29.3064 25.0944 24.5485 25.2894 24.4377C25.4588 24.3416 25.5776 23.9887 25.2845 23.8137C25.0737 23.6878 24.6383 23.4429 24.4876 23.3547C24.3343 23.2653 24.0481 23.1825 23.7406 23.3596C23.6294 23.4236 16.6216 27.4727 16.3841 27.6077C16.0999 27.7692 15.7446 27.7608 15.4613 27.5969C15.2376 27.4674 11.7083 25.4299 11.7083 25.4299V23.595C12.6219 24.1269 14.866 25.4228 15.4154 25.7356C15.8158 25.9636 16.0903 25.9433 16.4681 25.7239C16.8555 25.4987 25.0978 20.7379 25.2894 20.6292C25.4587 20.5328 25.5775 20.181 25.2845 20.0061C25.0737 19.8802 24.6383 19.6343 24.4876 19.5461C24.3342 19.4568 24.0479 19.375 23.7406 19.552C23.6251 19.6185 16.624 23.6627 16.3841 23.7991C16.0998 23.9607 15.7446 23.9523 15.4613 23.7883C15.2353 23.6575 11.7083 21.6223 11.7083 21.6223V19.7874C12.6219 20.3193 14.866 21.6152 15.4154 21.928C15.8157 22.1559 16.0904 22.1357 16.4681 21.9163C16.8555 21.6911 25.0978 16.9303 25.2894 16.8215C25.4588 16.7253 25.5775 16.3725 25.2845 16.1975C25.0736 16.0716 24.6382 15.8266 24.4876 15.7385C24.3342 15.6491 24.048 15.5674 23.7406 15.7444C23.6209 15.8133 16.6219 19.8563 16.3841 19.9915C16.0998 20.1531 15.7446 20.1447 15.4613 19.9807C15.2367 19.8507 11.7217 17.8224 11.7083 17.8147V16.2913C11.7085 13.7602 13.7603 11.7084 16.2914 11.7083H29.1253Z" fill="url(#paint1_linear_12865_530)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    <path id="Cutout" fill-rule="evenodd" clip-rule="evenodd" d="M23.7406 23.3603C24.048 23.1833 24.3342 23.265 24.4876 23.3545C24.6382 23.4426 25.0736 23.6875 25.2845 23.8134C25.5776 23.9884 25.4588 24.3413 25.2894 24.4375C25.0978 24.5462 16.8555 29.3071 16.4681 29.5322C16.0905 29.7515 15.8157 29.7718 15.4154 29.5439C14.866 29.2312 12.6219 27.9353 11.7083 27.4033V25.4306C11.7281 25.442 15.2374 27.467 15.4613 27.5966C15.7446 27.7606 16.0998 27.769 16.3841 27.6074C16.6214 27.4725 23.619 23.4303 23.7406 23.3603ZM23.7406 19.5517C24.0481 19.3746 24.3343 19.4574 24.4876 19.5468C24.6383 19.635 25.0736 19.8799 25.2845 20.0058C25.5776 20.1808 25.4588 20.5337 25.2894 20.6298C25.0957 20.7398 16.8555 25.4985 16.4681 25.7236C16.0903 25.9431 15.8157 25.9641 15.4154 25.7363C14.866 25.4236 12.622 24.1277 11.7083 23.5957V21.623C11.7382 21.6402 15.2385 23.6601 15.4613 23.789C15.7446 23.9529 16.0998 23.9613 16.3841 23.7998C16.6216 23.6648 23.6315 19.6146 23.7406 19.5517ZM23.7406 15.7441C24.0482 15.567 24.3343 15.6498 24.4876 15.7392C24.6383 15.8274 25.0737 16.0723 25.2845 16.1982C25.5776 16.3732 25.4588 16.7261 25.2894 16.8222C25.0928 16.9339 16.8554 21.6909 16.4681 21.916C16.0903 22.1355 15.8158 22.1557 15.4154 21.9277C14.8659 21.6149 12.622 20.3201 11.7083 19.788V17.8144C11.7083 17.8144 15.2376 19.8519 15.4613 19.9814C15.7445 20.1452 16.0999 20.1536 16.3841 19.9922C16.6215 19.8572 23.627 15.8095 23.7406 15.7441Z" fill="#57332F"/>
                    </g>
                    <g id="Underscore" filter="url(#filter2_ddii_12865_530)">
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="#ED8278"/>
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="url(#paint2_linear_12865_530)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    </g>
                    </g>
                    </g>
                    <defs>
                    <filter id="filter0_iiiiiiii_12865_530" x="4.83334" y="4.83325" width="62.3333" height="62.3333" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="6.63667"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 1 0"/>
                    <feBlend mode="plus-darker" in2="shape" result="effect1_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="1.30167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"/>
                    <feBlend mode="overlay" in2="effect1_innerShadow_12865_530" result="effect2_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect3_innerShadow_12865_530"/>
                    <feOffset dx="-0.88" dy="-0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect2_innerShadow_12865_530" result="effect3_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect4_innerShadow_12865_530"/>
                    <feOffset dx="-1.68667" dy="-1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect3_innerShadow_12865_530" result="effect4_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="-0.22" dy="-0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.45 0"/>
                    <feBlend mode="normal" in2="effect4_innerShadow_12865_530" result="effect5_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect6_innerShadow_12865_530"/>
                    <feOffset dx="0.88" dy="0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect5_innerShadow_12865_530" result="effect6_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect7_innerShadow_12865_530"/>
                    <feOffset dx="1.68667" dy="1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect6_innerShadow_12865_530" result="effect7_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="0.22" dy="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0"/>
                    <feBlend mode="normal" in2="effect7_innerShadow_12865_530" result="effect8_innerShadow_12865_530"/>
                    </filter>
                    <filter id="filter1_ddii_12865_530" x="7.12501" y="7.12492" width="31.1667" height="31.1667" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.634402 0 0 0 0 0.0791257 0 0 0 0 0.028646 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.635294 0 0 0 0 0.0781046 0 0 0 0 0.027451 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_530" result="effect2_dropShadow_12865_530"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_530" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.870968 0 0 0 0 0.649194 0 0 0 0 0.629032 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.7728 0 0 0 0 0.199333 0 0 0 0 0.1472 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_530" result="effect4_innerShadow_12865_530"/>
                    </filter>
                    <filter id="filter2_ddii_12865_530" x="33.4219" y="25.4584" width="26.5833" height="12.8334" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.634402 0 0 0 0 0.0791257 0 0 0 0 0.028646 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.635294 0 0 0 0 0.0781046 0 0 0 0 0.027451 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_530" result="effect2_dropShadow_12865_530"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_530" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.870968 0 0 0 0 0.649194 0 0 0 0 0.629032 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.7728 0 0 0 0 0.199333 0 0 0 0 0.1472 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_530" result="effect4_innerShadow_12865_530"/>
                    </filter>
                    <radialGradient id="paint0_radial_12865_530" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(36 24.9084) rotate(90) scale(44.8021 44.9389)">
                    <stop stop-opacity="0"/>
                    <stop offset="1"/>
                    </radialGradient>
                    <linearGradient id="paint1_linear_12865_530" x1="29.3542" y1="14.5728" x2="12.5406" y2="33.7347" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#330000"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear_12865_530" x1="51.0699" y1="30.6131" x2="50.4646" y2="35.1722" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#330000"/>
                    </linearGradient>
                    </defs>
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
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g id="Size=72, Style=Color">
                    <g id="TD CLI">
                    <rect x="3" y="3" width="66" height="66" rx="12" fill="#858585"/>
                    <g id="Terminal" filter="url(#filter0_iiiiiiii_12865_530)">
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="#60514E"/>
                    <rect x="4.83334" y="4.83325" width="62.3333" height="62.3333" rx="11" fill="url(#paint0_radial_12865_530)" fill-opacity="0.8"/>
                    <g id="Todoist">
                    <g id="Todoist_2" filter="url(#filter1_ddii_12865_530)">
                    <path d="M29.1253 11.7083C31.6564 11.7084 33.7082 13.7602 33.7083 16.2913V29.1252C33.7082 31.6563 31.6564 33.7081 29.1253 33.7083H16.2914C13.7603 33.7081 11.7085 31.6563 11.7083 29.1252V27.4036C12.622 27.9356 14.866 29.2315 15.4154 29.5442C15.8157 29.772 16.0904 29.751 16.4681 29.5315C16.8554 29.3064 25.0944 24.5485 25.2894 24.4377C25.4588 24.3416 25.5776 23.9887 25.2845 23.8137C25.0737 23.6878 24.6383 23.4429 24.4876 23.3547C24.3343 23.2653 24.0481 23.1825 23.7406 23.3596C23.6294 23.4236 16.6216 27.4727 16.3841 27.6077C16.0999 27.7692 15.7446 27.7608 15.4613 27.5969C15.2376 27.4674 11.7083 25.4299 11.7083 25.4299V23.595C12.6219 24.1269 14.866 25.4228 15.4154 25.7356C15.8158 25.9636 16.0903 25.9433 16.4681 25.7239C16.8555 25.4987 25.0978 20.7379 25.2894 20.6292C25.4587 20.5328 25.5775 20.181 25.2845 20.0061C25.0737 19.8802 24.6383 19.6343 24.4876 19.5461C24.3342 19.4568 24.0479 19.375 23.7406 19.552C23.6251 19.6185 16.624 23.6627 16.3841 23.7991C16.0998 23.9607 15.7446 23.9523 15.4613 23.7883C15.2353 23.6575 11.7083 21.6223 11.7083 21.6223V19.7874C12.6219 20.3193 14.866 21.6152 15.4154 21.928C15.8157 22.1559 16.0904 22.1357 16.4681 21.9163C16.8555 21.6911 25.0978 16.9303 25.2894 16.8215C25.4588 16.7253 25.5775 16.3725 25.2845 16.1975C25.0736 16.0716 24.6382 15.8266 24.4876 15.7385C24.3342 15.6491 24.048 15.5674 23.7406 15.7444C23.6209 15.8133 16.6219 19.8563 16.3841 19.9915C16.0998 20.1531 15.7446 20.1447 15.4613 19.9807C15.2367 19.8507 11.7217 17.8224 11.7083 17.8147V16.2913C11.7085 13.7602 13.7603 11.7084 16.2914 11.7083H29.1253Z" fill="#ED8278"/>
                    <path d="M29.1253 11.7083C31.6564 11.7084 33.7082 13.7602 33.7083 16.2913V29.1252C33.7082 31.6563 31.6564 33.7081 29.1253 33.7083H16.2914C13.7603 33.7081 11.7085 31.6563 11.7083 29.1252V27.4036C12.622 27.9356 14.866 29.2315 15.4154 29.5442C15.8157 29.772 16.0904 29.751 16.4681 29.5315C16.8554 29.3064 25.0944 24.5485 25.2894 24.4377C25.4588 24.3416 25.5776 23.9887 25.2845 23.8137C25.0737 23.6878 24.6383 23.4429 24.4876 23.3547C24.3343 23.2653 24.0481 23.1825 23.7406 23.3596C23.6294 23.4236 16.6216 27.4727 16.3841 27.6077C16.0999 27.7692 15.7446 27.7608 15.4613 27.5969C15.2376 27.4674 11.7083 25.4299 11.7083 25.4299V23.595C12.6219 24.1269 14.866 25.4228 15.4154 25.7356C15.8158 25.9636 16.0903 25.9433 16.4681 25.7239C16.8555 25.4987 25.0978 20.7379 25.2894 20.6292C25.4587 20.5328 25.5775 20.181 25.2845 20.0061C25.0737 19.8802 24.6383 19.6343 24.4876 19.5461C24.3342 19.4568 24.0479 19.375 23.7406 19.552C23.6251 19.6185 16.624 23.6627 16.3841 23.7991C16.0998 23.9607 15.7446 23.9523 15.4613 23.7883C15.2353 23.6575 11.7083 21.6223 11.7083 21.6223V19.7874C12.6219 20.3193 14.866 21.6152 15.4154 21.928C15.8157 22.1559 16.0904 22.1357 16.4681 21.9163C16.8555 21.6911 25.0978 16.9303 25.2894 16.8215C25.4588 16.7253 25.5775 16.3725 25.2845 16.1975C25.0736 16.0716 24.6382 15.8266 24.4876 15.7385C24.3342 15.6491 24.048 15.5674 23.7406 15.7444C23.6209 15.8133 16.6219 19.8563 16.3841 19.9915C16.0998 20.1531 15.7446 20.1447 15.4613 19.9807C15.2367 19.8507 11.7217 17.8224 11.7083 17.8147V16.2913C11.7085 13.7602 13.7603 11.7084 16.2914 11.7083H29.1253Z" fill="url(#paint1_linear_12865_530)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    <path id="Cutout" fill-rule="evenodd" clip-rule="evenodd" d="M23.7406 23.3603C24.048 23.1833 24.3342 23.265 24.4876 23.3545C24.6382 23.4426 25.0736 23.6875 25.2845 23.8134C25.5776 23.9884 25.4588 24.3413 25.2894 24.4375C25.0978 24.5462 16.8555 29.3071 16.4681 29.5322C16.0905 29.7515 15.8157 29.7718 15.4154 29.5439C14.866 29.2312 12.6219 27.9353 11.7083 27.4033V25.4306C11.7281 25.442 15.2374 27.467 15.4613 27.5966C15.7446 27.7606 16.0998 27.769 16.3841 27.6074C16.6214 27.4725 23.619 23.4303 23.7406 23.3603ZM23.7406 19.5517C24.0481 19.3746 24.3343 19.4574 24.4876 19.5468C24.6383 19.635 25.0736 19.8799 25.2845 20.0058C25.5776 20.1808 25.4588 20.5337 25.2894 20.6298C25.0957 20.7398 16.8555 25.4985 16.4681 25.7236C16.0903 25.9431 15.8157 25.9641 15.4154 25.7363C14.866 25.4236 12.622 24.1277 11.7083 23.5957V21.623C11.7382 21.6402 15.2385 23.6601 15.4613 23.789C15.7446 23.9529 16.0998 23.9613 16.3841 23.7998C16.6216 23.6648 23.6315 19.6146 23.7406 19.5517ZM23.7406 15.7441C24.0482 15.567 24.3343 15.6498 24.4876 15.7392C24.6383 15.8274 25.0737 16.0723 25.2845 16.1982C25.5776 16.3732 25.4588 16.7261 25.2894 16.8222C25.0928 16.9339 16.8554 21.6909 16.4681 21.916C16.0903 22.1355 15.8158 22.1557 15.4154 21.9277C14.8659 21.6149 12.622 20.3201 11.7083 19.788V17.8144C11.7083 17.8144 15.2376 19.8519 15.4613 19.9814C15.7445 20.1452 16.0999 20.1536 16.3841 19.9922C16.6215 19.8572 23.627 15.8095 23.7406 15.7441Z" fill="#57332F"/>
                    </g>
                    <g id="Underscore" filter="url(#filter2_ddii_12865_530)">
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="#ED8278"/>
                    <rect x="38.0052" y="30.0417" width="17.4167" height="3.66667" rx="1.83333" fill="url(#paint2_linear_12865_530)" fill-opacity="0.3" style="mix-blend-mode:color-burn"/>
                    </g>
                    </g>
                    </g>
                    </g>
                    <defs>
                    <filter id="filter0_iiiiiiii_12865_530" x="4.83334" y="4.83325" width="62.3333" height="62.3333" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="6.63667"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 0 0.94902 0 0 0 1 0"/>
                    <feBlend mode="plus-darker" in2="shape" result="effect1_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="1.30167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"/>
                    <feBlend mode="overlay" in2="effect1_innerShadow_12865_530" result="effect2_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect3_innerShadow_12865_530"/>
                    <feOffset dx="-0.88" dy="-0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect2_innerShadow_12865_530" result="effect3_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect4_innerShadow_12865_530"/>
                    <feOffset dx="-1.68667" dy="-1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 0 0.14902 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect3_innerShadow_12865_530" result="effect4_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="-0.22" dy="-0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.45 0"/>
                    <feBlend mode="normal" in2="effect4_innerShadow_12865_530" result="effect5_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect6_innerShadow_12865_530"/>
                    <feOffset dx="0.88" dy="0.88"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
                    <feBlend mode="overlay" in2="effect5_innerShadow_12865_530" result="effect6_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feMorphology radius="0.88" operator="dilate" in="SourceAlpha" result="effect7_innerShadow_12865_530"/>
                    <feOffset dx="1.68667" dy="1.68667"/>
                    <feGaussianBlur stdDeviation="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 1 0"/>
                    <feBlend mode="plus-lighter" in2="effect6_innerShadow_12865_530" result="effect7_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dx="0.22" dy="0.22"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0"/>
                    <feBlend mode="normal" in2="effect7_innerShadow_12865_530" result="effect8_innerShadow_12865_530"/>
                    </filter>
                    <filter id="filter1_ddii_12865_530" x="7.12501" y="7.12492" width="31.1667" height="31.1667" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.634402 0 0 0 0 0.0791257 0 0 0 0 0.028646 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.635294 0 0 0 0 0.0781046 0 0 0 0 0.027451 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_530" result="effect2_dropShadow_12865_530"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_530" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.870968 0 0 0 0 0.649194 0 0 0 0 0.629032 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.7728 0 0 0 0 0.199333 0 0 0 0 0.1472 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_530" result="effect4_innerShadow_12865_530"/>
                    </filter>
                    <filter id="filter2_ddii_12865_530" x="33.4219" y="25.4584" width="26.5833" height="12.8334" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="2.29167"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.634402 0 0 0 0 0.0791257 0 0 0 0 0.028646 0 0 0 0.7 0"/>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset/>
                    <feGaussianBlur stdDeviation="0.916667"/>
                    <feComposite in2="hardAlpha" operator="out"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.635294 0 0 0 0 0.0781046 0 0 0 0 0.027451 0 0 0 0.8 0"/>
                    <feBlend mode="normal" in2="effect1_dropShadow_12865_530" result="effect2_dropShadow_12865_530"/>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_12865_530" result="shape"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.870968 0 0 0 0 0.649194 0 0 0 0 0.629032 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="shape" result="effect3_innerShadow_12865_530"/>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                    <feOffset dy="-0.458333"/>
                    <feGaussianBlur stdDeviation="0.229167"/>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.7728 0 0 0 0 0.199333 0 0 0 0 0.1472 0 0 0 1 0"/>
                    <feBlend mode="normal" in2="effect3_innerShadow_12865_530" result="effect4_innerShadow_12865_530"/>
                    </filter>
                    <radialGradient id="paint0_radial_12865_530" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(36 24.9084) rotate(90) scale(44.8021 44.9389)">
                    <stop stop-opacity="0"/>
                    <stop offset="1"/>
                    </radialGradient>
                    <linearGradient id="paint1_linear_12865_530" x1="29.3542" y1="14.5728" x2="12.5406" y2="33.7347" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#330000"/>
                    </linearGradient>
                    <linearGradient id="paint2_linear_12865_530" x1="51.0699" y1="30.6131" x2="50.4646" y2="35.1722" gradientUnits="userSpaceOnUse">
                    <stop stop-color="white"/>
                    <stop offset="1" stop-color="#330000"/>
                    </linearGradient>
                    </defs>
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

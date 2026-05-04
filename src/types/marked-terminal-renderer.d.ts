// The marked-terminal-renderer package ships type declarations in
// renderer.d.mts but doesn't expose them via its `exports` map, so TS's
// NodeNext resolution can't find them. This ambient declaration restates
// just the surface we use in src/lib/markdown.ts so the integration is
// type-checked rather than cast through `unknown`.
declare module 'marked-terminal-renderer' {
    import type { MarkedExtension } from 'marked'

    export interface TerminalRendererOptions {
        [key: string]: unknown
    }

    export function darkTheme(options?: Partial<TerminalRendererOptions>): TerminalRendererOptions

    export function createTerminalRenderer(opts: TerminalRendererOptions): MarkedExtension
}

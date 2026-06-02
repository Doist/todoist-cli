import open from 'open'

type OpenInBrowserOptions = {
    /**
     * Print an `Opening <url>` line before launching. Default `true`. Callers
     * that already surface the URL themselves (e.g. `auth login`, where
     * cli-core prints the authorize URL) pass `false` to avoid a duplicate.
     */
    announce?: boolean
}

export async function openInBrowser(
    url: string,
    { announce = true }: OpenInBrowserOptions = {},
): Promise<void> {
    if (announce) console.log(`Opening ${url}`)
    await open(url)
}

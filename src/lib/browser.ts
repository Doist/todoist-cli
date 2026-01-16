import open from 'open'

export async function openInBrowser(url: string): Promise<void> {
    console.log(`Opening ${url}`)
    await open(url)
}

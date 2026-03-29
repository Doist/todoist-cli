export function truncateContent(content: string, maxLines: number): string {
    const lines = content.split('\n')
    if (lines.length <= maxLines) return content
    return `${lines.slice(0, maxLines).join('\n')}\n...`
}

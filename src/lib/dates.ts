export function getLocalDate(daysOffset = 0): string {
    const date = new Date()
    date.setDate(date.getDate() + daysOffset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDateHeader(dateStr: string, today: string): string {
    if (dateStr < today) return 'Overdue'
    if (dateStr === today) return 'Today'
    const tomorrow = getLocalDate(1)
    if (dateStr === tomorrow) return 'Tomorrow'
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    })
}

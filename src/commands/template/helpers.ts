import chalk from 'chalk'

interface ImportResult {
    status: string
    templateType: string
    projects: unknown[]
    sections: unknown[]
    tasks: unknown[]
    comments: unknown[]
}

export function formatImportResult(result: ImportResult): void {
    const counts = [
        result.tasks.length > 0 ? `${result.tasks.length} tasks` : null,
        result.sections.length > 0 ? `${result.sections.length} sections` : null,
        result.projects.length > 0 ? `${result.projects.length} projects` : null,
        result.comments.length > 0 ? `${result.comments.length} comments` : null,
    ].filter(Boolean)

    if (counts.length > 0) {
        console.log(`Imported: ${counts.join(', ')}`)
    } else {
        console.log('Template imported (no entities created)')
    }
    console.log(chalk.dim(`Type: ${result.templateType}`))
}

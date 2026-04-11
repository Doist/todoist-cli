import fs from 'node:fs'
import path from 'node:path'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { fetchBackups } from './helpers.js'

interface DownloadBackupOptions {
    outputFile: string
}

export async function downloadBackup(
    version: string,
    options: DownloadBackupOptions,
): Promise<void> {
    const api = await getApi()
    const backups = await fetchBackups(api)

    const backup = backups.find((b) => b.version === version)
    if (!backup) {
        throw new CliError('NOT_FOUND', `Backup version "${version}" not found`, [
            'Run `td backup list` to see available backup versions',
        ])
    }

    const response = await api.downloadBackup({ file: backup.url })
    if (!response.ok) {
        throw new CliError(
            'API_ERROR',
            `Failed to download backup: ${response.status} ${response.statusText}`,
        )
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const outputPath = path.resolve(options.outputFile)
    fs.writeFileSync(outputPath, buffer)

    if (!isQuiet()) {
        console.log(`Backup written to ${outputPath}`)
    }
}

import fs from 'node:fs'
import path from 'node:path'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'

interface DownloadBackupOptions {
    outputFile: string
}

export async function downloadBackup(
    version: string,
    options: DownloadBackupOptions,
): Promise<void> {
    const api = await getApi()

    let backups
    try {
        backups = await api.getBackups()
    } catch (error) {
        if (error instanceof CliError && error.code === 'AUTH_ERROR') {
            throw new CliError(
                'AUTH_ERROR',
                'Failed to access backups. Your token may be missing the backups:read scope.',
                [
                    'Re-authenticate to grant backup access: td auth login',
                    'If using an API token, ensure it has the backups:read scope',
                ],
            )
        }
        throw error
    }

    const backup = backups.find((b) => b.version === version)
    if (!backup) {
        throw new CliError('NOT_FOUND', `Backup version "${version}" not found`, [
            'Run `td backup list` to see available backup versions',
        ])
    }

    const response = await api.downloadBackup({ file: backup.url })
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const outputPath = path.resolve(options.outputFile)
    fs.writeFileSync(outputPath, buffer)

    if (!isQuiet()) {
        console.log(`Backup written to ${outputPath}`)
    }
}

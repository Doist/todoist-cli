import { getApiToken } from '../auth.js'
import { verboseFetch } from '../logger.js'

export interface UploadResult {
    fileName: string
    fileSize: number
    fileType: string
    fileUrl: string
    resourceType: string
    uploadState: string
}

export async function uploadFile(filePath: string): Promise<UploadResult> {
    const fs = await import('node:fs')
    const path = await import('node:path')

    const token = await getApiToken()
    const fileName = path.basename(filePath)
    const fileBuffer = fs.readFileSync(filePath)

    const formData = new FormData()
    formData.append('file_name', fileName)
    formData.append('file', new Blob([fileBuffer]), fileName)

    const response = await verboseFetch('https://api.todoist.com/api/v1/uploads', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    })

    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return {
        fileName: data.file_name,
        fileSize: data.file_size,
        fileType: data.file_type,
        fileUrl: data.file_url,
        resourceType: data.resource_type,
        uploadState: data.upload_state,
    }
}

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { Attachment, UploadFileArgs } from '@doist/todoist-sdk'
import { fetchTodoist } from './usage-tracking.js'

const UPLOADS_URL = 'https://api.todoist.com/api/v1/uploads'

/**
 * Drop-in replacement for `TodoistApi#uploadFile`. The SDK's upload-client
 * calls `validateAttachment(data)` on the raw `/api/v1/uploads` response
 * without first running `camelCaseKeys`, so `resource_type` never lands on
 * `resourceType` and Zod throws (other SDK clients camelCase before
 * validating). We POST the upload ourselves and translate the response
 * shape. Delete this file once the SDK applies `camelCaseKeys` to upload
 * responses and switch `createApiForToken` back to the stock method.
 */
export async function uploadAttachment(args: UploadFileArgs, token: string): Promise<Attachment> {
    const { body, fileName } = await resolveUploadBody(args)

    const form = new FormData()
    form.append('file_name', fileName)
    form.append('file', body, fileName)
    if (args.projectId) {
        form.append('project_id', args.projectId)
    }

    const response = await fetchTodoist(UPLOADS_URL, {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(
            `Upload failed: HTTP ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`,
        )
    }

    const raw = (await response.json()) as Record<string, unknown>
    return camelCaseAttachment(raw, fileName)
}

async function resolveUploadBody(args: UploadFileArgs): Promise<{ body: Blob; fileName: string }> {
    const { file, fileName } = args
    if (typeof file === 'string') {
        const buffer = await readFile(file)
        return { body: new Blob([new Uint8Array(buffer)]), fileName: fileName ?? basename(file) }
    }
    if (Buffer.isBuffer(file)) {
        if (!fileName) throw new Error('fileName is required when uploading from a Buffer')
        return { body: new Blob([new Uint8Array(file)]), fileName }
    }
    if (file instanceof Blob) {
        const inferred = file instanceof File ? file.name : undefined
        const name = fileName ?? inferred
        if (!name) throw new Error('fileName is required when uploading from a Blob')
        return { body: file, fileName: name }
    }
    throw new Error('Unsupported file input — pass a path, Buffer, Blob, or File.')
}

function camelCaseAttachment(raw: Record<string, unknown>, fallbackName: string): Attachment {
    const uploadState = raw.upload_state
    return {
        resourceType: typeof raw.resource_type === 'string' ? raw.resource_type : 'file',
        fileName: typeof raw.file_name === 'string' ? raw.file_name : fallbackName,
        fileSize: typeof raw.file_size === 'number' ? raw.file_size : null,
        fileType: typeof raw.file_type === 'string' ? raw.file_type : null,
        fileUrl: typeof raw.file_url === 'string' ? raw.file_url : null,
        uploadState: uploadState === 'pending' || uploadState === 'completed' ? uploadState : null,
        image: typeof raw.image === 'string' ? raw.image : null,
        imageWidth: typeof raw.image_width === 'number' ? raw.image_width : null,
        imageHeight: typeof raw.image_height === 'number' ? raw.image_height : null,
    }
}

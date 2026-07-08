import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import type { S3Config } from '../types'

export async function uploadToS3(
  config: S3Config,
  data: ArrayBuffer | Uint8Array,
  filename: string,
  contentType: string
): Promise<string> {
  // Generate unique key
  const timestamp = Date.now()
  const random = Math.random().toString(16).substring(2, 10)
  const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : ''
  const key = `${config.pathPrefix ? config.pathPrefix.replace(/\/$/, '') + '/' : ''}${timestamp}-${random}${ext}`

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'auto',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true, // needed for some S3-compatible services
  })

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: data instanceof ArrayBuffer ? new Uint8Array(data) : data,
    ContentType: contentType,
  }))

  const baseUrl = config.publicUrl.replace(/\/$/, '')
  return `${baseUrl}/${key}`
}

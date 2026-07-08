export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicUrl: string
  pathPrefix: string
}

export interface ConversionResult {
  filename: string
  blob: Blob
  mimeType: string
}

export type ConversionProgress = (message: string, percent: number) => void

export interface ConversionOption {
  id: string
  label: string
  from: string
  to: string
  accept: string
  icon: string
  needsS3: boolean
}

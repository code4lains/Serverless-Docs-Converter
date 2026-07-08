import mammoth from 'mammoth'
import TurndownService from 'turndown'
import type { S3Config, ConversionResult, ConversionProgress } from '../types'
import { replaceExtension, readFileAsArrayBuffer } from '../utils/file-helpers'

/**
 * Convert a DOCX file to Markdown format.
 *
 * Uses mammoth to extract HTML from the DOCX, optionally uploading
 * embedded images to S3, then converts the HTML to Markdown via turndown
 * with custom rules for tables and strikethrough.
 */
export async function convertDocxToMd(
  file: File,
  s3Config: S3Config | null,
  onProgress: ConversionProgress
): Promise<ConversionResult> {
  onProgress('Reading DOCX file...', 10)
  const arrayBuffer = await readFileAsArrayBuffer(file)

  onProgress('Converting document...', 30)

  let imageIndex = 0
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        imageIndex++
        if (!s3Config) {
          return { src: '' }
        }
        try {
          onProgress(`Uploading image ${imageIndex}...`, 30 + imageIndex * 5)
          const imageBuffer = await image.read()
          const ext = image.contentType.split('/')[1] || 'png'
          const filename = `image-${imageIndex}.${ext}`
          const { uploadToS3 } = await import('../utils/s3-client')
          const url = await uploadToS3(s3Config, imageBuffer, filename, image.contentType)
          return { src: url }
        } catch (e) {
          console.error('Failed to upload image:', e)
          return { src: '' }
        }
      })
    }
  )

  onProgress('Converting HTML to Markdown...', 80)

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })

  // --- Table support ---

  turndownService.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: (content) => {
      return ` ${content.trim().replace(/\n/g, ' ')} |`
    }
  })

  turndownService.addRule('tableRow', {
    filter: 'tr',
    replacement: (content) => {
      return `|${content}\n`
    }
  })

  turndownService.addRule('tableHead', {
    filter: 'thead',
    replacement: (content) => {
      const headerRow = content.trim()
      const columnCount = (headerRow.match(/\|/g) || []).length - 1
      const separator = '|' + ' --- |'.repeat(columnCount)
      return `${headerRow}${separator}\n`
    }
  })

  turndownService.addRule('tableBody', {
    filter: 'tbody',
    replacement: (content) => content
  })

  turndownService.addRule('table', {
    filter: 'table',
    replacement: (content) => `\n${content}\n`
  })

  // --- Remove images with empty src (discarded images) ---

  turndownService.addRule('emptyImage', {
    filter: (node) =>
      node.nodeName === 'IMG' && !(node as HTMLImageElement).getAttribute('src'),
    replacement: () => ''
  })

  // --- Strikethrough support ---

  turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'] as any,
    replacement: (content) => `~~${content}~~`
  })

  let markdown = turndownService.turndown(result.value)

  // Clean up excessive blank lines
  markdown = markdown.replace(/\n{3,}/g, '\n\n')

  onProgress('Done!', 100)

  return {
    filename: replaceExtension(file.name, 'md'),
    blob: new Blob([markdown], { type: 'text/markdown' }),
    mimeType: 'text/markdown'
  }
}

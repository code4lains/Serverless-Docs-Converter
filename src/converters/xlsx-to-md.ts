import * as XLSX from 'xlsx'
import type { S3Config, ConversionResult, ConversionProgress } from '../types'
import { replaceExtension, readFileAsArrayBuffer } from '../utils/file-helpers'

function escapeMdTable(text: string): string {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export async function convertXlsxToMd(
  file: File,
  s3Config: S3Config | null,
  onProgress: ConversionProgress
): Promise<ConversionResult> {
  onProgress('Reading XLSX file...', 10)
  const arrayBuffer = await readFileAsArrayBuffer(file)
  
  onProgress('Parsing spreadsheet...', 30)
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  
  const markdownParts: string[] = []
  const totalSheets = workbook.SheetNames.length
  
  workbook.SheetNames.forEach((sheetName, index) => {
    onProgress(`Converting sheet: ${sheetName}...`, 30 + (index / totalSheets) * 60)
    const sheet = workbook.Sheets[sheetName]
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    
    if (data.length === 0) return
    
    if (totalSheets > 1) {
      markdownParts.push(`## ${sheetName}\n`)
    }
    
    const maxCols = Math.max(...data.map(r => r.length))
    const normalized = data.map(r => {
      const row = [...r]
      while (row.length < maxCols) row.push('')
      return row.map(c => escapeMdTable(String(c)))
    })
    
    const header = normalized[0]
    const separator = header.map(() => '---')
    const lines = [
      '| ' + header.join(' | ') + ' |',
      '| ' + separator.join(' | ') + ' |',
      ...normalized.slice(1).map(row => '| ' + row.join(' | ') + ' |')
    ]
    
    markdownParts.push(lines.join('\n'))
  })
  
  const markdown = markdownParts.join('\n\n') + '\n'
  
  onProgress('Done!', 100)
  return {
    filename: replaceExtension(file.name, 'md'),
    blob: new Blob([markdown], { type: 'text/markdown' }),
    mimeType: 'text/markdown'
  }
}

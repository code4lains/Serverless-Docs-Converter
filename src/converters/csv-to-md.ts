import type { ConversionResult, ConversionProgress } from '../types'
import { replaceExtension, readFileAsText } from '../utils/file-helpers'

function parseCSV(text: string): string[][] {
  // Robust CSV parser
  // Handle: quoted fields, commas in quotes, newlines in quotes, escaped quotes ("")
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    
    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(current)
        current = ''
      } else if (char === '\r' && next === '\n') {
        row.push(current)
        current = ''
        rows.push(row)
        row = []
        i++
      } else if (char === '\n') {
        row.push(current)
        current = ''
        rows.push(row)
        row = []
      } else {
        current += char
      }
    }
  }
  if (current || row.length > 0) {
    row.push(current)
    rows.push(row)
  }
  return rows
}

function escapeMdTable(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export async function convertCsvToMd(
  file: File,
  onProgress: ConversionProgress
): Promise<ConversionResult> {
  onProgress('Reading CSV file...', 10)
  const text = await readFileAsText(file)
  
  onProgress('Parsing CSV...', 30)
  const rows = parseCSV(text.trim())
  
  if (rows.length === 0) {
    throw new Error('CSV file is empty')
  }
  
  onProgress('Generating Markdown table...', 60)
  const maxCols = Math.max(...rows.map(r => r.length))
  // Normalize rows to same column count
  const normalized = rows.map(r => {
    while (r.length < maxCols) r.push('')
    return r
  })
  
  const header = normalized[0]
  const separator = header.map(() => '---')
  const lines = [
    '| ' + header.map(escapeMdTable).join(' | ') + ' |',
    '| ' + separator.join(' | ') + ' |',
    ...normalized.slice(1).map(row =>
      '| ' + row.map(escapeMdTable).join(' | ') + ' |'
    )
  ]
  
  const markdown = lines.join('\n') + '\n'
  
  onProgress('Done!', 100)
  return {
    filename: replaceExtension(file.name, 'md'),
    blob: new Blob([markdown], { type: 'text/markdown' }),
    mimeType: 'text/markdown'
  }
}

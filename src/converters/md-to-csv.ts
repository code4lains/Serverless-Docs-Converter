import type { ConversionResult, ConversionProgress } from '../types'
import { replaceExtension, readFileAsText } from '../utils/file-helpers'

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic  
    .replace(/~~(.+?)~~/g, '$1')        // strikethrough
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
    .replace(/\\\|/g, '|')              // escaped pipes
    .trim()
}

function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return '"' + field.replace(/"/g, '""') + '"'
  }
  return field
}

function extractTables(markdown: string): string[][][] {
  const lines = markdown.split('\n')
  const tables: string[][][] = []
  let currentTable: string[][] = []
  let inTable = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('|') && line.endsWith('|')) {
      // Check if separator row
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      const isSeparator = cells.every(c => /^:?-+:?$/.test(c))
      if (isSeparator) {
        continue // skip separator
      }
      inTable = true
      currentTable.push(cells.map(stripMarkdownFormatting))
    } else {
      if (inTable && currentTable.length > 0) {
        tables.push(currentTable)
        currentTable = []
      }
      inTable = false
    }
  }
  if (currentTable.length > 0) {
    tables.push(currentTable)
  }
  return tables
}

export async function convertMdToCsv(
  file: File,
  onProgress: ConversionProgress
): Promise<ConversionResult> {
  onProgress('Reading Markdown file...', 10)
  const text = await readFileAsText(file)
  
  onProgress('Extracting tables...', 40)
  const tables = extractTables(text)
  
  if (tables.length === 0) {
    throw new Error('No tables found in the Markdown file')
  }
  
  onProgress('Generating CSV...', 70)
  const csvParts = tables.map(table =>
    table.map(row => row.map(escapeCSVField).join(',')).join('\n')
  )
  const csv = csvParts.join('\n\n') + '\n'
  
  onProgress('Done!', 100)
  return {
    filename: replaceExtension(file.name, 'csv'),
    blob: new Blob([csv], { type: 'text/csv' }),
    mimeType: 'text/csv'
  }
}

import * as XLSX from 'xlsx'
import type { ConversionResult, ConversionProgress } from '../types'
import { replaceExtension, readFileAsText } from '../utils/file-helpers'

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\\\|/g, '|')
    .trim()
}

function extractTables(markdown: string): string[][][] {
  const lines = markdown.split('\n')
  const tables: string[][][] = []
  let currentTable: string[][] = []
  let inTable = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      const isSeparator = cells.every(c => /^:?-+:?$/.test(c))
      if (isSeparator) continue
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
  if (currentTable.length > 0) tables.push(currentTable)
  return tables
}

export async function convertMdToXlsx(
  file: File,
  onProgress: ConversionProgress
): Promise<ConversionResult> {
  onProgress('Reading Markdown file...', 10)
  const text = await readFileAsText(file)
  
  onProgress('Extracting tables...', 30)
  const tables = extractTables(text)
  
  if (tables.length === 0) {
    throw new Error('No tables found in the Markdown file')
  }
  
  onProgress('Creating spreadsheet...', 60)
  const workbook = XLSX.utils.book_new()
  
  tables.forEach((table, index) => {
    const ws = XLSX.utils.aoa_to_sheet(table)
    XLSX.utils.book_append_sheet(workbook, ws, `Sheet${index + 1}`)
  })
  
  onProgress('Generating file...', 90)
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  
  onProgress('Done!', 100)
  return {
    filename: replaceExtension(file.name, 'xlsx'),
    blob,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
}

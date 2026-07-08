import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ExternalHyperlink,
  ShadingType,
  LevelFormat,
  convertInchesToTwip,
} from 'docx'
import { marked, type Token, type Tokens } from 'marked'
import type { ConversionResult, ConversionProgress } from '../types'
import { replaceExtension, readFileAsText } from '../utils/file-helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

const THIN_BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: '999999',
}

/** Numbering reference used by ordered lists. */
const ORDERED_LIST_REF = 'ordered-list-numbering'

// ---------------------------------------------------------------------------
// Inline token parsing
// ---------------------------------------------------------------------------

interface InlineStyle {
  bold?: boolean
  italics?: boolean
  font?: { name: string }
  shading?: { type: typeof ShadingType.CLEAR; color: string; fill: string }
  color?: string
  underline?: { type: 'single'; color?: string }
  strike?: boolean
}

/**
 * Recursively convert inline marked tokens to an array of docx TextRun /
 * ExternalHyperlink children, merging outer formatting into each leaf.
 */
function parseInlineTokens(
  tokens: Token[],
  inheritedStyle: InlineStyle = {}
): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = []

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text
        // Text tokens may themselves contain nested tokens (e.g. "foo **bar**")
        if (t.tokens && t.tokens.length > 0) {
          runs.push(...parseInlineTokens(t.tokens, inheritedStyle))
        } else {
          runs.push(
            new TextRun({
              text: t.raw,
              ...inheritedStyle,
            })
          )
        }
        break
      }

      case 'strong': {
        const t = token as Tokens.Strong
        const children = t.tokens ?? []
        runs.push(
          ...parseInlineTokens(children, { ...inheritedStyle, bold: true })
        )
        break
      }

      case 'em': {
        const t = token as Tokens.Em
        const children = t.tokens ?? []
        runs.push(
          ...parseInlineTokens(children, { ...inheritedStyle, italics: true })
        )
        break
      }

      case 'codespan': {
        const t = token as Tokens.Codespan
        runs.push(
          new TextRun({
            text: t.text,
            ...inheritedStyle,
            font: { name: 'Consolas' },
            shading: {
              type: ShadingType.CLEAR,
              color: '000000',
              fill: 'E8E8E8',
            },
          })
        )
        break
      }

      case 'link': {
        const t = token as Tokens.Link
        const linkChildren = t.tokens ?? []
        const linkRuns = parseInlineTokens(linkChildren, {
          ...inheritedStyle,
          color: '2563EB',
          underline: { type: 'single', color: '2563EB' },
        })
        // ExternalHyperlink only accepts TextRun children, so flatten
        for (const child of linkRuns) {
          if (child instanceof TextRun) {
            runs.push(
              new ExternalHyperlink({
                link: t.href,
                children: [child],
              })
            )
          } else {
            // Nested hyperlink edge-case – just push the child as-is
            runs.push(child)
          }
        }
        break
      }

      case 'del': {
        const t = token as Tokens.Del
        const children = t.tokens ?? []
        runs.push(
          ...parseInlineTokens(children, { ...inheritedStyle, strike: true })
        )
        break
      }

      case 'br': {
        runs.push(new TextRun({ break: 1, ...inheritedStyle }))
        break
      }

      case 'escape': {
        const t = token as Tokens.Escape
        runs.push(new TextRun({ text: t.text, ...inheritedStyle }))
        break
      }

      case 'html': {
        const t = token as Tokens.HTML
        // Strip tags and emit raw text
        const stripped = t.raw.replace(/<[^>]*>/g, '')
        if (stripped) {
          runs.push(new TextRun({ text: stripped, ...inheritedStyle }))
        }
        break
      }

      case 'image': {
        const t = token as Tokens.Image
        runs.push(
          new TextRun({
            text: `[Image: ${t.href}]`,
            ...inheritedStyle,
            italics: true,
            color: '6B7280',
          })
        )
        break
      }

      default: {
        // Fallback – render raw text
        if ('raw' in token && typeof (token as any).raw === 'string') {
          runs.push(new TextRun({ text: (token as any).raw, ...inheritedStyle }))
        }
        break
      }
    }
  }

  return runs
}

/**
 * Convenience wrapper that parses a raw markdown inline string and returns
 * docx children.
 */
function parseInlineContent(text: string): (TextRun | ExternalHyperlink)[] {
  const tokens = marked.lexer(text)
  // marked.lexer wraps inline content in a paragraph token
  const inlineTokens: Token[] = []
  for (const t of tokens) {
    if (t.type === 'paragraph' && (t as Tokens.Paragraph).tokens) {
      inlineTokens.push(...(t as Tokens.Paragraph).tokens!)
    } else {
      inlineTokens.push(t)
    }
  }
  const result = parseInlineTokens(inlineTokens)
  // Ensure at least one run so the paragraph is not empty
  return result.length > 0 ? result : [new TextRun({ text: '' })]
}

// ---------------------------------------------------------------------------
// Block-level token processing
// ---------------------------------------------------------------------------

/**
 * Walk a list of block-level tokens and produce docx elements
 * (Paragraph | Table).
 */
function processTokens(
  tokens: Token[],
  elements: (Paragraph | Table)[]
): void {
  for (const token of tokens) {
    switch (token.type) {
      // ---- Headings --------------------------------------------------------
      case 'heading': {
        const t = token as Tokens.Heading
        const level = HEADING_LEVELS[t.depth] ?? HeadingLevel.HEADING_1
        elements.push(
          new Paragraph({
            heading: level,
            children: parseInlineTokens(t.tokens ?? []),
            spacing: { before: 240, after: 120 },
          })
        )
        break
      }

      // ---- Paragraphs ------------------------------------------------------
      case 'paragraph': {
        const t = token as Tokens.Paragraph
        elements.push(
          new Paragraph({
            children: parseInlineTokens(t.tokens ?? []),
            spacing: { after: 120 },
          })
        )
        break
      }

      // ---- Code blocks -----------------------------------------------------
      case 'code': {
        const t = token as Tokens.Code
        const lines = t.text.split('\n')
        for (const line of lines) {
          elements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line || ' ', // keep blank lines visible
                  font: { name: 'Consolas' },
                  size: 20, // 10pt
                }),
              ],
              shading: {
                type: ShadingType.CLEAR,
                color: '000000',
                fill: 'F3F4F6',
              },
              spacing: { before: 0, after: 0 },
              indent: { left: convertInchesToTwip(0.25) },
            })
          )
        }
        // Add spacing after the code block
        elements.push(new Paragraph({ spacing: { before: 120 } }))
        break
      }

      // ---- Blockquotes -----------------------------------------------------
      case 'blockquote': {
        const t = token as Tokens.Blockquote
        // Process child tokens into a temporary array, then wrap each in
        // blockquote styling.
        const innerElements: (Paragraph | Table)[] = []
        processTokens(t.tokens ?? [], innerElements)
        for (const el of innerElements) {
          if (el instanceof Paragraph) {
            elements.push(
              new Paragraph({
                ...((el as any).options ?? {}),
                children: (el as any).root?.[0]?.children ?? [],
                indent: { left: convertInchesToTwip(0.5) },
                border: {
                  left: {
                    style: BorderStyle.SINGLE,
                    size: 6,
                    color: '9CA3AF',
                    space: 8,
                  },
                },
                shading: {
                  type: ShadingType.CLEAR,
                  color: '000000',
                  fill: 'F9FAFB',
                },
                spacing: { before: 60, after: 60 },
              })
            )
          } else {
            elements.push(el)
          }
        }
        break
      }

      // ---- Unordered lists -------------------------------------------------
      case 'list': {
        const t = token as Tokens.List
        processListItems(t.items, t.ordered, 0, elements)
        break
      }

      // ---- Tables ----------------------------------------------------------
      case 'table': {
        const t = token as Tokens.Table
        const rows: TableRow[] = []

        // Header row
        rows.push(
          new TableRow({
            tableHeader: true,
            children: t.header.map(
              (cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: parseInlineTokens(cell.tokens ?? []),
                      alignment: cellAlignment(cell.align),
                    }),
                  ],
                  width: {
                    size: Math.floor(100 / t.header.length),
                    type: WidthType.PERCENTAGE,
                  },
                  borders: cellBorders(),
                  shading: {
                    type: ShadingType.CLEAR,
                    color: '000000',
                    fill: 'F3F4F6',
                  },
                })
            ),
          })
        )

        // Body rows
        for (const row of t.rows) {
          rows.push(
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: parseInlineTokens(cell.tokens ?? []),
                        alignment: cellAlignment(cell.align),
                      }),
                    ],
                    width: {
                      size: Math.floor(100 / t.header.length),
                      type: WidthType.PERCENTAGE,
                    },
                    borders: cellBorders(),
                  })
              ),
            })
          )
        }

        elements.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        )
        // spacing after table
        elements.push(new Paragraph({ spacing: { before: 120 } }))
        break
      }

      // ---- Horizontal rules ------------------------------------------------
      case 'hr': {
        elements.push(
          new Paragraph({
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 6,
                color: 'D1D5DB',
                space: 1,
              },
            },
            spacing: { before: 240, after: 240 },
          })
        )
        break
      }

      // ---- HTML (raw) – best-effort strip tags -----------------------------
      case 'html': {
        const t = token as Tokens.HTML
        const stripped = t.raw.replace(/<[^>]*>/g, '').trim()
        if (stripped) {
          elements.push(
            new Paragraph({
              children: [new TextRun({ text: stripped })],
              spacing: { after: 120 },
            })
          )
        }
        break
      }

      // ---- Space – ignore --------------------------------------------------
      case 'space':
        break

      // ---- Fallback --------------------------------------------------------
      default: {
        if ('raw' in token && typeof (token as any).raw === 'string') {
          elements.push(
            new Paragraph({
              children: [new TextRun({ text: (token as any).raw })],
              spacing: { after: 120 },
            })
          )
        }
        break
      }
    }
  }
}

// ---------------------------------------------------------------------------
// List helpers
// ---------------------------------------------------------------------------

function processListItems(
  items: Tokens.ListItem[],
  ordered: boolean,
  level: number,
  elements: (Paragraph | Table)[]
): void {
  for (const item of items) {
    // Collect inline content from the item (skip nested lists – handled below)
    const inlineTokens: Token[] = []
    let nestedList: Tokens.List | null = null

    for (const child of item.tokens ?? []) {
      if (child.type === 'list') {
        nestedList = child as Tokens.List
      } else if (child.type === 'text' && (child as Tokens.Text).tokens) {
        inlineTokens.push(...((child as Tokens.Text).tokens as Token[]))
      } else if (child.type === 'paragraph' && (child as Tokens.Paragraph).tokens) {
        inlineTokens.push(...((child as Tokens.Paragraph).tokens as Token[]))
      } else {
        inlineTokens.push(child)
      }
    }

    const children = inlineTokens.length > 0
      ? parseInlineTokens(inlineTokens)
      : [new TextRun({ text: item.raw.replace(/^[-*\d.]+\s*/, '').split('\n')[0] })]

    if (ordered) {
      elements.push(
        new Paragraph({
          children,
          numbering: { reference: ORDERED_LIST_REF, level },
          spacing: { before: 40, after: 40 },
        })
      )
    } else {
      elements.push(
        new Paragraph({
          children,
          bullet: { level },
          spacing: { before: 40, after: 40 },
        })
      )
    }

    // Recurse into nested lists
    if (nestedList) {
      processListItems(nestedList.items, nestedList.ordered, level + 1, elements)
    }
  }
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

function cellBorders() {
  return {
    top: THIN_BORDER,
    bottom: THIN_BORDER,
    left: THIN_BORDER,
    right: THIN_BORDER,
  }
}

function cellAlignment(
  align: 'center' | 'left' | 'right' | null
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (align) {
    case 'center':
      return AlignmentType.CENTER
    case 'right':
      return AlignmentType.RIGHT
    case 'left':
      return AlignmentType.LEFT
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Main conversion function
// ---------------------------------------------------------------------------

/**
 * Convert a Markdown file to DOCX format.
 *
 * Parses the markdown with `marked`, walks the token tree, and constructs a
 * docx `Document` that mirrors the structure and formatting of the original.
 */
export async function convertMdToDocx(
  file: File,
  onProgress: ConversionProgress
): Promise<ConversionResult> {
  onProgress('Reading Markdown file...', 10)
  const text = await readFileAsText(file)

  onProgress('Parsing Markdown...', 30)
  const tokens = marked.lexer(text)

  onProgress('Building document...', 50)
  const elements: (Paragraph | Table)[] = []
  processTokens(tokens, elements)

  // Ensure document is not empty
  if (elements.length === 0) {
    elements.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
  }

  onProgress('Generating DOCX...', 80)

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REF,
          levels: Array.from({ length: 9 }, (_, i) => ({
            level: i,
            format: LevelFormat.DECIMAL,
            text: `%${i + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: {
                  left: convertInchesToTwip(0.5 * (i + 1)),
                  hanging: convertInchesToTwip(0.25),
                },
              },
            },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 24, // 12pt
          },
        },
        heading1: {
          run: { size: 48, bold: true, color: '1F2937' },
        },
        heading2: {
          run: { size: 36, bold: true, color: '1F2937' },
        },
        heading3: {
          run: { size: 28, bold: true, color: '374151' },
        },
        heading4: {
          run: { size: 26, bold: true, color: '374151' },
        },
        heading5: {
          run: { size: 24, bold: true, color: '4B5563' },
        },
        heading6: {
          run: { size: 22, bold: true, italics: true, color: '4B5563' },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: elements,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)

  onProgress('Done!', 100)

  return {
    filename: replaceExtension(file.name, 'docx'),
    blob,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
}

export interface TextSegmentOptions {
  language: string
  targetLength?: number
  maxLength?: number
}

const CJK_LANGUAGE_PREFIXES = ['zh', 'ja', 'ko']
const SENTENCE_ENDINGS = /[^。！？.!?；;]+[。！？.!?；;]?/gu
const CLAUSE_ENDINGS = /[^，,、：:]+[，,、：:]?/gu

/**
 * 按自然段、句子、分句顺序切分长文本。
 *
 * 目标不是机械地每 N 个字符砍一刀，而是尽量在标点处结束，
 * 减少不同音频片段拼接后的突兀感。
 */
export function segmentTtsText(text: string, options: TextSegmentOptions): string[] {
  const normalizedText = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim()

  if (!normalizedText) {
    return []
  }

  const isCjk = CJK_LANGUAGE_PREFIXES.some((prefix) => options.language.startsWith(prefix))
  const targetLength = options.targetLength ?? (isCjk ? 260 : 720)
  const maxLength = options.maxLength ?? (isCjk ? 360 : 1000)
  const separator = isCjk ? '' : ' '
  const units: string[] = []

  for (const paragraph of normalizedText.split(/\n{2,}|\n/g)) {
    const trimmedParagraph = paragraph.trim()
    if (!trimmedParagraph) {
      continue
    }

    const sentences = trimmedParagraph.match(SENTENCE_ENDINGS) ?? [trimmedParagraph]

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim()
      if (!trimmedSentence) {
        continue
      }

      if (trimmedSentence.length <= maxLength) {
        units.push(trimmedSentence)
        continue
      }

      const clauses = trimmedSentence.match(CLAUSE_ENDINGS) ?? [trimmedSentence]
      for (const clause of clauses) {
        const trimmedClause = clause.trim()

        if (trimmedClause.length <= maxLength) {
          units.push(trimmedClause)
          continue
        }

        for (let index = 0; index < trimmedClause.length; index += maxLength) {
          units.push(trimmedClause.slice(index, index + maxLength))
        }
      }
    }
  }

  const segments: string[] = []
  let current = ''

  for (const unit of units) {
    const candidate = current ? `${current}${separator}${unit}` : unit

    if (current && (candidate.length > maxLength || current.length >= targetLength)) {
      segments.push(current.trim())
      current = unit
    } else {
      current = candidate
    }
  }

  if (current.trim()) {
    segments.push(current.trim())
  }

  return segments
}

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SubtitleCue, TtsWorkflowOutput } from '../../../shared/agent/editingPlan'

function splitText(text: string, maxChars: number): string[] {
  const clean = text.trim()
  if (!clean) return []
  const sentenceParts = clean.split(/(?<=[。！？!?；;，,、：:])/u).filter(Boolean)
  const result: string[] = []
  let current = ''

  for (const part of sentenceParts) {
    if ((current + part).length <= maxChars) {
      current += part
      continue
    }
    if (current) result.push(current.trim())
    let rest = part.trim()
    while (rest.length > maxChars) {
      result.push(rest.slice(0, maxChars))
      rest = rest.slice(maxChars)
    }
    current = rest
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function weight(text: string): number {
  return Math.max(1, [...text].filter((char) => !/\s/u.test(char)).length)
}

export function buildSubtitleCues(voice: TtsWorkflowOutput, maxChars = 22): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  let counter = 0

  for (const segment of voice.segments) {
    const parts = splitText(segment.text, maxChars)
    if (parts.length === 0) continue
    const totalWeight = parts.reduce((sum, part) => sum + weight(part), 0)
    let cursor = segment.startSeconds

    parts.forEach((part, index) => {
      counter += 1
      const isLast = index === parts.length - 1
      const duration = isLast
        ? segment.endSeconds - cursor
        : segment.durationSeconds * (weight(part) / totalWeight)
      const end = isLast ? segment.endSeconds : Math.min(segment.endSeconds, cursor + duration)
      cues.push({
        id: `subtitle-${String(counter).padStart(4, '0')}`,
        text: part,
        startSeconds: cursor,
        endSeconds: end
      })
      cursor = end
    })
  }
  return cues
}

function formatTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  const millis = ms % 1000
  return (
    [hours, minutes, secs].map((n) => String(n).padStart(2, '0')).join(':') +
    `,${String(millis).padStart(3, '0')}`
  )
}

export class SubtitleTool {
  build(voice: TtsWorkflowOutput): SubtitleCue[] {
    return buildSubtitleCues(voice)
  }

  async writeSrt(path: string, cues: SubtitleCue[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const content = cues
      .map(
        (cue, index) =>
          `${index + 1}\n${formatTime(cue.startSeconds)} --> ${formatTime(cue.endSeconds)}\n${cue.text}\n`
      )
      .join('\n')
    await writeFile(path, content, 'utf8')
  }
}

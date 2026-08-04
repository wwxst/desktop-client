import { describe, expect, it } from 'vitest'

import { segmentTtsText } from './textSegmenter'

describe('segmentTtsText', () => {
  it('按中文标点切分，并保留全部有效文本', () => {
    const text = `${'这是第一句话。'.repeat(30)}\n${'这是第二段内容！'.repeat(30)}`
    const segments = segmentTtsText(text, { language: 'zh-CN' })

    expect(segments.length).toBeGreaterThan(1)
    expect(segments.every((segment) => segment.length <= 360)).toBe(true)
    expect(segments.join('')).toBe(text.replace('\n', ''))
  })

  it('英文分段时不会产生空片段', () => {
    const text = Array.from(
      { length: 80 },
      (_, index) => `Sentence number ${index + 1} explains a part of the story.`
    ).join(' ')

    const segments = segmentTtsText(text, { language: 'en-US' })

    expect(segments.length).toBeGreaterThan(1)
    expect(segments.every((segment) => segment.trim().length > 0)).toBe(true)
    expect(segments.every((segment) => segment.length <= 1000)).toBe(true)
    expect(segments.slice(0, -1).every((segment) => segment.endsWith('.'))).toBe(true)
  })

  it('空文本返回空数组', () => {
    expect(segmentTtsText('  \n\n ', { language: 'zh-CN' })).toEqual([])
  })
})

import { open, readFile } from 'node:fs/promises'

interface WavFormat {
  audioFormat: number
  channels: number
  sampleRate: number
  byteRate: number
  blockAlign: number
  bitsPerSample: number
}

interface WavInfo {
  format: WavFormat
  dataOffset: number
  dataLength: number
}

function parseWav(buffer: Buffer): WavInfo {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('生成的音频不是有效的 WAV 文件')
  }

  if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('生成的音频缺少 WAVE 标记')
  }

  let offset = 12
  let format: WavFormat | null = null
  let dataOffset = -1
  let dataLength = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkLength = buffer.readUInt32LE(offset + 4)
    const chunkDataOffset = offset + 8

    if (chunkId === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(chunkDataOffset),
        channels: buffer.readUInt16LE(chunkDataOffset + 2),
        sampleRate: buffer.readUInt32LE(chunkDataOffset + 4),
        byteRate: buffer.readUInt32LE(chunkDataOffset + 8),
        blockAlign: buffer.readUInt16LE(chunkDataOffset + 12),
        bitsPerSample: buffer.readUInt16LE(chunkDataOffset + 14)
      }
    }

    if (chunkId === 'data') {
      dataOffset = chunkDataOffset
      dataLength = Math.min(chunkLength, buffer.length - chunkDataOffset)
      break
    }

    offset = chunkDataOffset + chunkLength + (chunkLength % 2)
  }

  if (!format || dataOffset < 0) {
    throw new Error('WAV 文件缺少 fmt 或 data 数据块')
  }

  if (format.audioFormat !== 1 || format.bitsPerSample !== 16) {
    throw new Error('当前只支持合并 16 位 PCM WAV 音频')
  }

  return {
    format,
    dataOffset,
    dataLength
  }
}

function isSameFormat(first: WavFormat, second: WavFormat): boolean {
  return (
    first.audioFormat === second.audioFormat &&
    first.channels === second.channels &&
    first.sampleRate === second.sampleRate &&
    first.byteRate === second.byteRate &&
    first.blockAlign === second.blockAlign &&
    first.bitsPerSample === second.bitsPerSample
  )
}

function createWavHeader(format: WavFormat, dataLength: number): Buffer {
  const header = Buffer.alloc(44)

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(format.audioFormat, 20)
  header.writeUInt16LE(format.channels, 22)
  header.writeUInt32LE(format.sampleRate, 24)
  header.writeUInt32LE(format.byteRate, 28)
  header.writeUInt16LE(format.blockAlign, 32)
  header.writeUInt16LE(format.bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataLength, 40)

  return header
}

export async function mergeWavFiles(inputPaths: string[], outputPath: string): Promise<number> {
  if (inputPaths.length === 0) {
    throw new Error('没有可合并的音频片段')
  }

  let baseFormat: WavFormat | null = null
  let totalDataLength = 0

  for (const inputPath of inputPaths) {
    const buffer = await readFile(inputPath)
    const info = parseWav(buffer)

    if (!baseFormat) {
      baseFormat = info.format
    } else if (!isSameFormat(baseFormat, info.format)) {
      throw new Error('音频片段的采样率或声道不一致，无法合并')
    }

    totalDataLength += info.dataLength
  }

  if (!baseFormat) {
    throw new Error('没有读取到有效音频格式')
  }

  if (totalDataLength > 0xffffffff - 36) {
    throw new Error('生成的 WAV 音频超过 4GB，请拆分文本后分批生成')
  }

  const output = await open(outputPath, 'w')

  try {
    await output.write(createWavHeader(baseFormat, totalDataLength))

    for (const inputPath of inputPaths) {
      const buffer = await readFile(inputPath)
      const info = parseWav(buffer)
      await output.write(buffer.subarray(info.dataOffset, info.dataOffset + info.dataLength))
    }
  } finally {
    await output.close()
  }

  return totalDataLength / baseFormat.byteRate
}

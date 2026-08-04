import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import * as tar from 'tar-stream'
import unbzip2Stream from 'unbzip2-stream'

/**
 * 解压 sherpa-onnx 官方发布的 tar.bz2 模型包。
 *
 * 这里不调用系统 tar 命令，避免用户电脑没有配置 tar 时安装失败。
 */
export async function extractTarBz2(archivePath: string, targetDirectory: string): Promise<void> {
  await mkdir(targetDirectory, { recursive: true })

  const targetRoot = resolve(targetDirectory)
  const extractor = tar.extract()

  extractor.on('entry', (header, entryStream, next) => {
    const handleEntry = async (): Promise<void> => {
      const destination = resolve(targetRoot, header.name)
      const targetPrefix = `${targetRoot}${sep}`

      if (destination !== targetRoot && !destination.startsWith(targetPrefix)) {
        throw new Error(`模型压缩包包含不安全路径：${header.name}`)
      }

      if (header.type === 'directory') {
        await mkdir(destination, { recursive: true })
        entryStream.resume()
        return
      }

      if (header.type && header.type !== 'file' && header.type !== 'contiguous-file') {
        // 模型包不需要符号链接或设备文件，直接跳过。
        entryStream.resume()
        return
      }

      await mkdir(dirname(destination), { recursive: true })
      await pipeline(entryStream, createWriteStream(destination))

      if (typeof header.mode === 'number') {
        await chmod(destination, header.mode).catch(() => undefined)
      }
    }

    void handleEntry()
      .then(() => next())
      .catch((error) => extractor.destroy(error instanceof Error ? error : new Error(String(error))))
  })

  await pipeline(createReadStream(archivePath), unbzip2Stream(), extractor)
}

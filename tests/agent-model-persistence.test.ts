import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findInternalModelProvider } from '../src/main/agent/modelCatalog'
import { ModelRegistry } from '../src/main/agent/runtime/ModelRegistry'
import { ModelRegistryStore } from '../src/main/agent/runtime/ModelRegistryStore'

const temporaryDirectories: string[] = []

async function createStore(): Promise<{ path: string; store: ModelRegistryStore }> {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-client-model-registry-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'model-configurations.json')
  return {
    path,
    store: new ModelRegistryStore(path, {
      encrypt: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
      decrypt: (value) => {
        const decrypted = Buffer.from(value).toString('utf8')
        if (!decrypted.startsWith('encrypted:')) throw new Error('decrypt failed')
        return decrypted.slice('encrypted:'.length)
      }
    })
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('Agent model persistence', () => {
  it('restores configurations after restart without writing plaintext API keys', async () => {
    const { path, store } = await createStore()
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')
    registry.create({
      kind: 'provider',
      providerId: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: 'provider-secret'
    })

    await store.save(registry.exportSnapshot())

    const persisted = await readFile(path, 'utf8')
    expect(persisted).not.toContain('provider-secret')
    expect(persisted).toContain(Buffer.from('encrypted:provider-secret').toString('base64'))

    const restored = new ModelRegistry(findInternalModelProvider)
    restored.restore(await store.load())
    expect(restored.list()).toEqual(registry.list())
    expect(restored.getRuntimeConfig('config-1')).toMatchObject({
      apiKey: 'provider-secret',
      model: 'deepseek-v4-flash'
    })
  })

  it('persists updates with retained keys and deletions', async () => {
    const { store } = await createStore()
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')
    registry.create({
      kind: 'custom',
      baseUrl: 'https://old.example.test/v1',
      modelId: 'old-model',
      apiKey: 'original-secret'
    })
    await store.save(registry.exportSnapshot())

    registry.update({
      id: 'config-1',
      kind: 'custom',
      baseUrl: 'https://new.example.test/v1',
      modelId: 'new-model',
      apiKey: ''
    })
    await store.save(registry.exportSnapshot())

    const restored = new ModelRegistry(findInternalModelProvider)
    restored.restore(await store.load())
    expect(restored.getRuntimeConfig('config-1')).toMatchObject({
      baseUrl: 'https://new.example.test/v1',
      model: 'new-model',
      apiKey: 'original-secret'
    })

    restored.delete('config-1')
    await store.save(restored.exportSnapshot())
    const afterDelete = new ModelRegistry(findInternalModelProvider)
    afterDelete.restore(await store.load())
    expect(afterDelete.list()).toEqual([])
  })

  it('rejects corrupted files and secrets that cannot be decrypted', async () => {
    const { path, store } = await createStore()
    await writeFile(path, '{invalid json', 'utf8')
    await expect(store.load()).rejects.toBeInstanceOf(Error)

    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        configurations: [
          {
            item: {
              id: 'config-1',
              kind: 'custom',
              baseUrl: 'https://gateway.example.test/v1',
              modelId: 'chat-model'
            },
            encryptedApiKey: Buffer.from('not-encrypted', 'utf8').toString('base64')
          }
        ]
      }),
      'utf8'
    )
    await expect(store.load()).rejects.toThrow('decrypt failed')
  })
})

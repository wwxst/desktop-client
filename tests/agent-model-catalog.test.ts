import { describe, expect, it } from 'vitest'
import {
  FALLBACK_MODEL_CATALOG,
  findInternalModelProvider,
  parseModelCatalog
} from '../src/main/agent/modelCatalog'

describe('Agent model catalog', () => {
  it('provides the six built-in providers with valid recommended models', () => {
    expect(FALLBACK_MODEL_CATALOG.providers.map((provider) => provider.id)).toEqual([
      'openai',
      'deepseek',
      'qwen',
      'zhipu',
      'kimi',
      'doubao'
    ])

    for (const provider of FALLBACK_MODEL_CATALOG.providers) {
      expect(provider.models.some((model) => model.id === provider.recommendedModelId)).toBe(true)
      expect(provider).not.toHaveProperty('baseUrl')
    }
  })

  it('resolves provider-only metadata in Main without exposing Base URLs publicly', () => {
    expect(findInternalModelProvider('deepseek')).toMatchObject({
      id: 'deepseek',
      baseUrl: 'https://api.deepseek.com'
    })
    expect(FALLBACK_MODEL_CATALOG.providers[0]).not.toHaveProperty('baseUrl')
  })

  it('accepts a strict public catalog response', () => {
    expect(
      parseModelCatalog({
        providers: [
          {
            id: 'company-ai',
            name: 'Company AI',
            recommendedModelId: 'company-chat',
            models: [{ id: 'company-chat', name: 'Company Chat', description: 'Internal model' }]
          }
        ]
      })
    ).toEqual({
      providers: [
        {
          id: 'company-ai',
          name: 'Company AI',
          recommendedModelId: 'company-chat',
          models: [{ id: 'company-chat', name: 'Company Chat', description: 'Internal model' }]
        }
      ]
    })
  })

  it.each([
    null,
    { providers: [] },
    {
      providers: [
        {
          id: 'duplicate',
          name: 'First',
          recommendedModelId: 'first',
          models: [{ id: 'first', name: 'First' }]
        },
        {
          id: 'duplicate',
          name: 'Second',
          recommendedModelId: 'second',
          models: [{ id: 'second', name: 'Second' }]
        }
      ]
    },
    {
      providers: [
        {
          id: 'missing-recommendation',
          name: 'Missing Recommendation',
          recommendedModelId: 'missing',
          models: [{ id: 'present', name: 'Present' }]
        }
      ]
    },
    {
      providers: [
        {
          id: 'leaky',
          name: 'Leaky',
          baseUrl: 'https://secret.example.test/v1',
          recommendedModelId: 'model',
          models: [{ id: 'model', name: 'Model' }]
        }
      ]
    }
  ])('rejects an invalid or leaky catalog response', (value) => {
    expect(parseModelCatalog(value)).toBeNull()
  })
})

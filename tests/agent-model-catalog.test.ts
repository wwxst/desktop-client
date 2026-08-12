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

  it('uses the current generation of provider models in the fallback catalog', () => {
    expect(
      Object.fromEntries(
        FALLBACK_MODEL_CATALOG.providers.map((provider) => [
          provider.id,
          {
            recommendedModelId: provider.recommendedModelId,
            modelIds: provider.models.map((model) => model.id)
          }
        ])
      )
    ).toEqual({
      openai: {
        recommendedModelId: 'gpt-5.6-terra',
        modelIds: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
      },
      deepseek: {
        recommendedModelId: 'deepseek-v4-flash',
        modelIds: ['deepseek-v4-flash', 'deepseek-v4-pro']
      },
      qwen: {
        recommendedModelId: 'qwen3.7-plus',
        modelIds: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.7-flash']
      },
      zhipu: {
        recommendedModelId: 'glm-5.2',
        modelIds: ['glm-5.2', 'glm-5.1', 'glm-5-turbo']
      },
      kimi: {
        recommendedModelId: 'kimi-k3',
        modelIds: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6']
      },
      doubao: {
        recommendedModelId: 'doubao-seed-2-1-pro-260628',
        modelIds: [
          'doubao-seed-2-1-pro-260628',
          'doubao-seed-2-1-turbo-260628',
          'doubao-seed-evolving'
        ]
      }
    })
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

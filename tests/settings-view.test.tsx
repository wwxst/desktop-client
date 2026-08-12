import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsView from '../src/renderer/src/components/Settings/SettingsView'
import type {
  AgentModelCatalogResponse,
  AgentModelRegistryItem
} from '../src/shared/agent/workflow'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

const catalog: AgentModelCatalogResponse = {
  success: true,
  message: '模型目录加载成功',
  source: 'remote',
  catalog: {
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        recommendedModelId: 'gpt-4o-mini',
        models: [
          { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
          { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' }
        ]
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        recommendedModelId: 'deepseek-chat',
        models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }]
      }
    ]
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

function setAgentApi(
  configurations: AgentModelRegistryItem[] = [],
  overrides: Partial<typeof window.api> = {}
): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listAgentModelCatalog: vi.fn().mockResolvedValue(catalog),
      listAgentModelConfigurations: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置加载成功',
        configurations
      }),
      createAgentModelConfiguration: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置添加成功',
        configuration: {
          id: 'created-config',
          kind: 'provider',
          providerId: 'openai',
          providerName: 'OpenAI',
          modelId: 'gpt-4o-mini',
          modelName: 'GPT-4o mini'
        }
      }),
      updateAgentModelConfiguration: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置更新成功'
      }),
      deleteAgentModelConfiguration: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置已删除'
      }),
      ...overrides
    }
  })
}

describe('SettingsView model management', () => {
  beforeEach(() => setAgentApi())

  it('renders a single compact model table without grouping, default, or enabled controls', async () => {
    setAgentApi([
      {
        id: 'config-1',
        kind: 'provider',
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-4o-mini',
        modelName: 'GPT-4o mini'
      }
    ])
    render(<SettingsView onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'AI 模型' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加模型' })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: '模型配置' })
    expect(within(table).getByText('OpenAI')).toBeInTheDocument()
    expect(within(table).getByText('GPT-4o mini')).toBeInTheDocument()
    expect(within(table).queryByText('默认')).not.toBeInTheDocument()
    expect(within(table).queryByText('启用')).not.toBeInTheDocument()
    expect(screen.queryByText('已添加')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('disables provider inputs while the catalog loads but keeps custom inputs available', async () => {
    const deferred = createDeferred<AgentModelCatalogResponse>()
    setAgentApi([], { listAgentModelCatalog: vi.fn(() => deferred.promise) })
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '添加模型' }))
    const dialog = screen.getByRole('dialog', { name: '添加模型' })
    expect(within(dialog).getByRole('combobox', { name: '大模型厂商' })).toBeDisabled()
    expect(within(dialog).getByRole('combobox', { name: '模型' })).toBeDisabled()
    expect(within(dialog).getByLabelText('API Key')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '添加' })).toBeDisabled()

    await user.click(within(dialog).getByRole('tab', { name: '自定义配置' }))
    expect(within(dialog).getByRole('textbox', { name: 'Base URL' })).toBeEnabled()
    expect(within(dialog).getByRole('textbox', { name: '模型 ID' })).toBeEnabled()
    expect(within(dialog).getByLabelText('API Key')).toBeEnabled()

    deferred.resolve(catalog)
  })

  it('disables saving when a pending catalog request resolves without a catalog', async () => {
    const deferred = createDeferred<AgentModelCatalogResponse>()
    setAgentApi([], { listAgentModelCatalog: vi.fn(() => deferred.promise) })
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '添加模型' }))
    const dialog = screen.getByRole('dialog', { name: '添加模型' })
    await user.click(within(dialog).getByRole('tab', { name: '自定义配置' }))
    expect(within(dialog).getByRole('button', { name: '添加' })).toBeEnabled()

    deferred.resolve({
      success: false,
      message: '模型目录不可用',
      source: 'unavailable',
      catalog: null
    })

    await waitFor(() => expect(within(dialog).getByRole('button', { name: '添加' })).toBeDisabled())
    expect(within(dialog).getByRole('alert')).toHaveTextContent('模型目录不可用')
  })

  it('switches provider models and selects the recommended model without showing Base URL', async () => {
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)
    await screen.findByRole('table', { name: '模型配置' })
    await user.click(screen.getByRole('button', { name: '添加模型' }))
    const dialog = screen.getByRole('dialog', { name: '添加模型' })

    expect(within(dialog).queryByText('Base URL')).not.toBeInTheDocument()
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: '大模型厂商' }),
      'deepseek'
    )
    expect(within(dialog).getByRole('combobox', { name: '模型' })).toHaveValue('deepseek-chat')
    expect(within(dialog).queryByRole('option', { name: 'GPT-4o mini' })).not.toBeInTheDocument()
  })

  it('shows only Base URL, model ID, and API Key for custom configuration', async () => {
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '添加模型' }))
    const dialog = screen.getByRole('dialog', { name: '添加模型' })
    await user.click(within(dialog).getByRole('tab', { name: '自定义配置' }))

    expect(within(dialog).getByRole('textbox', { name: 'Base URL' })).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: '模型 ID' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('API Key')).toHaveAttribute('type', 'password')
    expect(within(dialog).queryByText('API 格式')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('大模型厂商')).not.toBeInTheDocument()
  })

  it('submits provider fields and clears the API key after adding', async () => {
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '添加模型' }))
    const dialog = screen.getByRole('dialog', { name: '添加模型' })
    await user.type(within(dialog).getByLabelText('API Key'), 'provider-secret')
    await user.click(within(dialog).getByRole('button', { name: '添加' }))

    await waitFor(() =>
      expect(window.api.createAgentModelConfiguration).toHaveBeenCalledWith({
        kind: 'provider',
        providerId: 'openai',
        modelId: 'gpt-4o-mini',
        apiKey: 'provider-secret'
      })
    )
    expect(screen.queryByRole('dialog', { name: '添加模型' })).not.toBeInTheDocument()
  })

  it('submits custom fields without an API-format value', async () => {
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '添加模型' }))
    const dialog = screen.getByRole('dialog', { name: '添加模型' })
    await user.click(within(dialog).getByRole('tab', { name: '自定义配置' }))
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Base URL' }),
      'https://gateway.test/v1'
    )
    await user.type(within(dialog).getByRole('textbox', { name: '模型 ID' }), 'company-chat')
    await user.type(within(dialog).getByLabelText('API Key'), 'custom-secret')
    await user.click(within(dialog).getByRole('button', { name: '添加' }))

    await waitFor(() =>
      expect(window.api.createAgentModelConfiguration).toHaveBeenCalledWith({
        kind: 'custom',
        baseUrl: 'https://gateway.test/v1',
        modelId: 'company-chat',
        apiKey: 'custom-secret'
      })
    )
  })

  it('shows Main save errors inside the dialog and preserves the current fields', async () => {
    setAgentApi([], {
      createAgentModelConfiguration: vi.fn().mockResolvedValue({
        success: false,
        message: '大模型 API Key 不能为空'
      })
    })
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '添加模型' }))
    const dialog = screen.getByRole('dialog', { name: '添加模型' })
    await user.click(within(dialog).getByRole('button', { name: '添加' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('大模型 API Key 不能为空')
    expect(within(dialog).getByRole('combobox', { name: '大模型厂商' })).toHaveValue('openai')
    expect(within(dialog).getByRole('combobox', { name: '模型' })).toHaveValue('gpt-4o-mini')

    await user.click(within(dialog).getByRole('button', { name: '关闭' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not refill API keys when editing and keeps the old key when left blank', async () => {
    setAgentApi([
      {
        id: 'config-1',
        kind: 'custom',
        baseUrl: 'https://old.test/v1',
        modelId: 'old-model'
      }
    ])
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)
    const table = await screen.findByRole('table', { name: '模型配置' })
    await user.click(within(table).getByRole('button', { name: '编辑 old-model' }))
    const dialog = screen.getByRole('dialog', { name: '编辑模型' })

    expect(within(dialog).getByLabelText('API Key')).toHaveValue('')
    await user.clear(within(dialog).getByRole('textbox', { name: '模型 ID' }))
    await user.type(within(dialog).getByRole('textbox', { name: '模型 ID' }), 'new-model')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(window.api.updateAgentModelConfiguration).toHaveBeenCalledWith({
        id: 'config-1',
        kind: 'custom',
        baseUrl: 'https://old.test/v1',
        modelId: 'new-model',
        apiKey: ''
      })
    )
  })

  it('removes a deleted configuration from the table', async () => {
    setAgentApi([
      {
        id: 'config-1',
        kind: 'provider',
        providerId: 'deepseek',
        providerName: 'DeepSeek',
        modelId: 'deepseek-chat',
        modelName: 'DeepSeek Chat'
      }
    ])
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)
    const table = await screen.findByRole('table', { name: '模型配置' })
    await user.click(within(table).getByRole('button', { name: '删除 DeepSeek Chat' }))

    await waitFor(() =>
      expect(window.api.deleteAgentModelConfiguration).toHaveBeenCalledWith('config-1')
    )
    expect(screen.queryByText('DeepSeek Chat')).not.toBeInTheDocument()
  })

  it('shows a non-blocking notice when Main uses the built-in catalog', async () => {
    setAgentApi([], {
      listAgentModelCatalog: vi.fn().mockResolvedValue({
        ...catalog,
        source: 'fallback',
        message: '远程目录不可用，当前使用内置模型目录'
      })
    })
    render(<SettingsView onBack={vi.fn()} />)

    expect(await screen.findByRole('status')).toHaveTextContent('当前使用内置模型目录')
    expect(screen.getByRole('button', { name: '添加模型' })).toBeEnabled()
  })

  it('keeps the page visible and disables changes for an incomplete Preload API', async () => {
    Object.defineProperty(window, 'api', { configurable: true, value: {} })
    render(<SettingsView onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'AI 模型' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('AI 模型管理接口不可用')
    expect(screen.getByRole('button', { name: '添加模型' })).toBeDisabled()
  })
})

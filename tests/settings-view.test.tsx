import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsView from '../src/renderer/src/components/Settings/SettingsView'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

function setAgentApi(overrides: Partial<typeof window.api> = {}): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      getAgentModelStatus: vi.fn().mockResolvedValue({ configured: false }),
      configureAgentModel: vi.fn().mockResolvedValue({
        success: true,
        message: '大模型配置已加载到主进程内存'
      }),
      ...overrides
    }
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    setAgentApi()
  })

  it('renders only the confirmed AI model settings', async () => {
    render(<SettingsView onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'AI 模型' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toBeInTheDocument()
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('textbox', { name: '模型名称' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('未配置'))
    expect(screen.getByRole('button', { name: '保存配置' })).toBeInTheDocument()
    expect(screen.queryByText('温度')).not.toBeInTheDocument()
    expect(screen.queryByText('请求超时')).not.toBeInTheDocument()
    await waitFor(() => expect(window.api.getAgentModelStatus).toHaveBeenCalledOnce())
  })

  it('filters the settings navigation from the search field', async () => {
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)

    await user.type(screen.getByRole('searchbox', { name: '搜索设置' }), '语音')

    expect(screen.queryByRole('button', { name: 'AI 模型' })).not.toBeInTheDocument()
    expect(screen.getByText('无匹配设置')).toBeInTheDocument()
  })

  it('loads the endpoint and model without ever filling an API key', async () => {
    vi.mocked(window.api.getAgentModelStatus).mockResolvedValueOnce({
      configured: true,
      baseUrl: 'https://example.test/v1',
      model: 'studio-model'
    })

    render(<SettingsView onBack={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Base URL' })).toHaveValue(
        'https://example.test/v1'
      )
    )
    expect(screen.getByRole('textbox', { name: '模型名称' })).toHaveValue('studio-model')
    expect(screen.getByLabelText('API Key')).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent('已配置')
  })

  it('labels a model status request failure as a read failure', async () => {
    vi.mocked(window.api.getAgentModelStatus).mockRejectedValueOnce(new Error('读取配置失败'))

    render(<SettingsView onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('读取配置失败'))
    expect(screen.getByRole('status')).toHaveTextContent('读取失败')
  })

  it('locks editing until the initial model status has loaded', async () => {
    const statusRequest = createDeferred<{
      configured: boolean
      baseUrl: string
      model: string
    }>()
    vi.mocked(window.api.getAgentModelStatus).mockReturnValueOnce(statusRequest.promise)

    render(<SettingsView onBack={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('读取中')
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toBeDisabled()
    expect(screen.getByLabelText('API Key')).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '模型名称' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()

    statusRequest.resolve({
      configured: true,
      baseUrl: 'https://loaded.test/v1',
      model: 'loaded-model'
    })

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Base URL' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toHaveValue('https://loaded.test/v1')
    expect(screen.getByRole('textbox', { name: '模型名称' })).toHaveValue('loaded-model')
    expect(screen.getByRole('button', { name: '保存配置' })).toBeEnabled()
  })

  it('saves the five model fields and clears the API key after success', async () => {
    const user = userEvent.setup()
    render(<SettingsView onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Base URL' })).toBeEnabled())
    await user.type(screen.getByRole('textbox', { name: 'Base URL' }), 'https://example.test/v1')
    await user.type(screen.getByLabelText('API Key'), 'secret-key')
    await user.type(screen.getByRole('textbox', { name: '模型名称' }), 'studio-model')
    await user.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() =>
      expect(window.api.configureAgentModel).toHaveBeenCalledWith({
        baseUrl: 'https://example.test/v1',
        apiKey: 'secret-key',
        model: 'studio-model'
      })
    )
    expect(screen.getByRole('status')).toHaveTextContent('已配置')
    expect(screen.getByLabelText('API Key')).toHaveValue('')
  })

  it('shows the Main error when saving fails', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.configureAgentModel).mockResolvedValueOnce({
      success: false,
      message: '大模型 Base URL 不能为空'
    })
    render(<SettingsView onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: '保存配置' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('大模型 Base URL 不能为空')
    )
    expect(screen.getByRole('status')).toHaveTextContent('保存失败')
  })

  it('lets Main validate a malformed Base URL', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.configureAgentModel).mockResolvedValueOnce({
      success: false,
      message: 'Model Base URL must be a valid HTTP(S) URL'
    })
    render(<SettingsView onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Base URL' })).toBeEnabled())
    await user.type(screen.getByRole('textbox', { name: 'Base URL' }), 'not-a-url')
    await user.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() =>
      expect(window.api.configureAgentModel).toHaveBeenCalledWith({
        baseUrl: 'not-a-url',
        apiKey: '',
        model: ''
      })
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Model Base URL must be a valid HTTP(S) URL'
    )
  })

  it('keeps the settings page visible when the Preload API is unavailable', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: undefined
    })

    render(<SettingsView onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'AI 模型' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('AI 配置接口不可用'))
    expect(screen.getByRole('status')).toHaveTextContent('读取失败')
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
    expect(window.api).toBeUndefined()
  })

  it('rejects an incomplete Preload API without invoking it', async () => {
    const getAgentModelStatus = vi.fn().mockResolvedValue({ configured: false })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { getAgentModelStatus }
    })

    render(<SettingsView onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('AI 配置接口不可用'))
    expect(getAgentModelStatus).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
  })
})

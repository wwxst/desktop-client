import { ArrowLeft, CheckCircle2, CircleAlert, Cpu, Search } from 'lucide-react'
import { useEffect, useState, type FormEvent, type JSX } from 'react'
import type { AgentModelStatus } from '../../../../shared/agent/workflow'
import './SettingsView.css'

interface SettingsViewProps {
  onBack: () => void
}

type AgentSettingsApi = Pick<typeof window.api, 'getAgentModelStatus' | 'configureAgentModel'>
type SaveState = 'loading' | 'idle' | 'saving' | 'configured' | 'error'

function getAgentSettingsApi(): AgentSettingsApi | null {
  const api = (window as unknown as { api?: unknown }).api
  if (typeof api !== 'object' || api === null) return null

  const candidate = api as Record<string, unknown>
  if (
    typeof candidate.getAgentModelStatus !== 'function' ||
    typeof candidate.configureAgentModel !== 'function'
  ) {
    return null
  }

  return api as AgentSettingsApi
}

function SettingsView({ onBack }: SettingsViewProps): JSX.Element {
  const [agentApi] = useState<AgentSettingsApi | null>(() => getAgentSettingsApi())
  const agentApiAvailable = agentApi !== null
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [saveState, setSaveState] = useState<SaveState>(() =>
    agentApiAvailable ? 'loading' : 'error'
  )
  const [statusMessage, setStatusMessage] = useState(() =>
    agentApiAvailable ? '读取中' : '读取失败'
  )
  const [errorMessage, setErrorMessage] = useState(() =>
    agentApiAvailable ? '' : 'AI 配置接口不可用'
  )
  const showsAiModel = 'AI 模型'
    .toLocaleLowerCase()
    .includes(searchValue.trim().toLocaleLowerCase())

  useEffect(() => {
    let active = true

    if (!agentApiAvailable) {
      return () => {
        active = false
      }
    }

    void agentApi
      .getAgentModelStatus()
      .then((status: AgentModelStatus) => {
        if (!active) return
        setBaseUrl(status.baseUrl ?? '')
        setModel(status.model ?? '')
        setSaveState(status.configured ? 'configured' : 'idle')
        setStatusMessage(status.configured ? '已配置' : '未配置')
      })
      .catch((error: unknown) => {
        if (!active) return
        setSaveState('error')
        setStatusMessage('读取失败')
        setErrorMessage(error instanceof Error ? error.message : '读取 AI 配置失败')
      })

    return () => {
      active = false
    }
  }, [agentApi, agentApiAvailable])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!agentApi || saveState === 'loading' || saveState === 'saving') return

    setSaveState('saving')
    setStatusMessage('保存中')
    setErrorMessage('')

    try {
      const response = await agentApi.configureAgentModel({
        baseUrl: baseUrl.trim(),
        apiKey,
        model: model.trim()
      })

      if (!response.success) {
        setSaveState('error')
        setStatusMessage('保存失败')
        setErrorMessage(response.message)
        return
      }

      setApiKey('')
      setSaveState('configured')
      setStatusMessage('已配置')
    } catch (error: unknown) {
      setSaveState('error')
      setStatusMessage('保存失败')
      setErrorMessage(error instanceof Error ? error.message : '保存 AI 配置失败')
    }
  }

  return (
    <section className="studio-settings" aria-label="设置">
      <aside className="studio-settings__navigation" aria-label="设置导航">
        <button className="studio-settings__back" type="button" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.7} aria-hidden="true" />
          <span>返回应用</span>
        </button>

        <label className="studio-settings__search">
          <Search size={15} strokeWidth={1.7} aria-hidden="true" />
          <input
            type="search"
            value={searchValue}
            aria-label="搜索设置"
            placeholder="搜索设置..."
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </label>

        <div className="studio-settings__nav-group">
          <span className="studio-settings__nav-heading">配置</span>
          {showsAiModel ? (
            <button
              className="studio-settings__nav-item is-active"
              type="button"
              aria-current="page"
            >
              <Cpu size={16} strokeWidth={1.7} aria-hidden="true" />
              <span>AI 模型</span>
            </button>
          ) : (
            <span className="studio-settings__empty-navigation">无匹配设置</span>
          )}
        </div>
      </aside>

      <div className="studio-settings__content">
        <div className="studio-settings__content-inner">
          <header className="studio-settings__heading">
            <h1>AI 模型</h1>
          </header>

          <form className="studio-settings__form" onSubmit={handleSubmit}>
            <div className="studio-settings__card">
              <label className="studio-settings__field">
                <span>Base URL</span>
                <input
                  type="text"
                  value={baseUrl}
                  disabled={!agentApiAvailable || saveState === 'loading'}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://api.example.com/v1"
                  autoComplete="url"
                />
              </label>

              <label className="studio-settings__field">
                <span>API Key</span>
                <input
                  type="password"
                  value={apiKey}
                  disabled={!agentApiAvailable || saveState === 'loading'}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="输入 API Key"
                  autoComplete="new-password"
                />
              </label>

              <label className="studio-settings__field">
                <span>模型名称</span>
                <input
                  type="text"
                  value={model}
                  disabled={!agentApiAvailable || saveState === 'loading'}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="例如 gpt-4o-mini"
                  autoComplete="off"
                />
              </label>

              <div className="studio-settings__status-row">
                <span className="studio-settings__field-label">当前连接状态</span>
                <span
                  className={`studio-settings__status is-${saveState}`}
                  role="status"
                  aria-live="polite"
                >
                  {saveState === 'error' ? (
                    <CircleAlert size={15} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={15} strokeWidth={1.8} aria-hidden="true" />
                  )}
                  {statusMessage}
                </span>
              </div>
            </div>

            {errorMessage && (
              <p className="studio-settings__error" role="alert">
                {errorMessage}
              </p>
            )}

            <div className="studio-settings__actions">
              <button
                className="studio-settings__save"
                type="submit"
                disabled={!agentApiAvailable || saveState === 'loading' || saveState === 'saving'}
              >
                {saveState === 'saving' ? '保存中...' : '保存配置'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}

export default SettingsView

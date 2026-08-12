import { ArrowLeft, Cpu, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type JSX } from 'react'
import type {
  AgentModelCatalog,
  AgentModelCreateRequest,
  AgentModelProvider,
  AgentModelRegistryItem,
  AgentModelUpdateRequest
} from '../../../../shared/agent/workflow'
import './SettingsView.css'

interface SettingsViewProps {
  onBack: () => void
}

type AgentSettingsApi = Pick<
  typeof window.api,
  | 'listAgentModelCatalog'
  | 'listAgentModelConfigurations'
  | 'createAgentModelConfiguration'
  | 'updateAgentModelConfiguration'
  | 'deleteAgentModelConfiguration'
>

type EditorMode = 'provider' | 'custom'

interface ModelEditorState {
  editingId: string | null
  mode: EditorMode
  providerId: string
  modelId: string
  baseUrl: string
  apiKey: string
}

function getAgentSettingsApi(): AgentSettingsApi | null {
  const api = (window as unknown as { api?: unknown }).api
  if (typeof api !== 'object' || api === null) return null

  const candidate = api as Record<string, unknown>
  const methods = [
    'listAgentModelCatalog',
    'listAgentModelConfigurations',
    'createAgentModelConfiguration',
    'updateAgentModelConfiguration',
    'deleteAgentModelConfiguration'
  ]
  return methods.every((method) => typeof candidate[method] === 'function')
    ? (api as AgentSettingsApi)
    : null
}

function initialEditorState(): ModelEditorState {
  return {
    editingId: null,
    mode: 'provider',
    providerId: '',
    modelId: '',
    baseUrl: '',
    apiKey: ''
  }
}

function resolveProvider(
  catalog: AgentModelCatalog | null,
  requestedId: string
): AgentModelProvider | null {
  if (!catalog?.providers.length) return null
  return catalog.providers.find((provider) => provider.id === requestedId) ?? catalog.providers[0]
}

function resolveModelId(provider: AgentModelProvider | null, requestedId: string): string {
  if (!provider) return ''
  return provider.models.some((model) => model.id === requestedId)
    ? requestedId
    : provider.recommendedModelId
}

function displayName(item: AgentModelRegistryItem): string {
  return item.modelName ?? item.modelId
}

function SettingsView({ onBack }: SettingsViewProps): JSX.Element {
  const [agentApi] = useState<AgentSettingsApi | null>(() => getAgentSettingsApi())
  const [catalog, setCatalog] = useState<AgentModelCatalog | null>(null)
  const [configurations, setConfigurations] = useState<AgentModelRegistryItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(agentApi !== null)
  const [configurationsLoading, setConfigurationsLoading] = useState(agentApi !== null)
  const [fallbackNotice, setFallbackNotice] = useState('')
  const [pageErrorMessage, setPageErrorMessage] = useState(agentApi ? '' : 'AI 模型管理接口不可用')
  const [editorErrorMessage, setEditorErrorMessage] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editor, setEditor] = useState<ModelEditorState>(initialEditorState)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const showsAiModel = 'AI 模型'
    .toLocaleLowerCase()
    .includes(searchValue.trim().toLocaleLowerCase())

  useEffect(() => {
    let active = true
    if (!agentApi) return () => undefined

    void agentApi
      .listAgentModelCatalog()
      .then((response) => {
        if (!active) return
        if (!response.success || !response.catalog?.providers.length) {
          setCatalog(null)
          setPageErrorMessage(response.message || '模型目录不可用')
          return
        }
        setCatalog(response.catalog)
        setFallbackNotice(response.source === 'fallback' ? response.message : '')
      })
      .catch((error: unknown) => {
        if (!active) return
        setCatalog(null)
        setPageErrorMessage(error instanceof Error ? error.message : '模型目录不可用')
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })

    void agentApi
      .listAgentModelConfigurations()
      .then((response) => {
        if (!active) return
        if (!response.success) {
          setPageErrorMessage(response.message)
          return
        }
        setConfigurations(response.configurations)
      })
      .catch((error: unknown) => {
        if (active) {
          setPageErrorMessage(error instanceof Error ? error.message : '模型配置加载失败')
        }
      })
      .finally(() => {
        if (active) setConfigurationsLoading(false)
      })

    return () => {
      active = false
    }
  }, [agentApi])

  const provider = resolveProvider(catalog, editor.providerId)
  const providerId = provider?.id ?? ''
  const providerModelId = resolveModelId(provider, editor.modelId)
  const providerUnavailable = catalogLoading || !provider
  const catalogUnavailable = !catalogLoading && catalog === null
  const canOpenEditor = agentApi !== null && (catalogLoading || catalog !== null)

  const openCreateEditor = (): void => {
    const firstProvider = catalog?.providers[0]
    setEditor({
      ...initialEditorState(),
      providerId: firstProvider?.id ?? '',
      modelId: firstProvider?.recommendedModelId ?? ''
    })
    setEditorErrorMessage('')
    setEditorOpen(true)
  }

  const openEditEditor = (item: AgentModelRegistryItem): void => {
    const itemProvider = resolveProvider(catalog, item.providerId ?? '')
    setEditor({
      editingId: item.id,
      mode: item.kind,
      providerId: itemProvider?.id ?? '',
      modelId: item.kind === 'provider' ? resolveModelId(itemProvider, item.modelId) : item.modelId,
      baseUrl: item.baseUrl ?? '',
      apiKey: ''
    })
    setEditorErrorMessage('')
    setEditorOpen(true)
  }

  const closeEditor = (): void => {
    if (saving) return
    setEditorOpen(false)
    setEditor(initialEditorState())
    setEditorErrorMessage('')
  }

  const changeMode = (mode: EditorMode): void => {
    const firstProvider = catalog?.providers[0]
    setEditor((current) => ({
      ...current,
      mode,
      providerId: mode === 'provider' ? (firstProvider?.id ?? '') : current.providerId,
      modelId: mode === 'provider' ? (firstProvider?.recommendedModelId ?? '') : '',
      baseUrl: '',
      apiKey: ''
    }))
    setEditorErrorMessage('')
  }

  const handleProviderChange = (nextProviderId: string): void => {
    const nextProvider = resolveProvider(catalog, nextProviderId)
    setEditor((current) => ({
      ...current,
      providerId: nextProvider?.id ?? '',
      modelId: nextProvider?.recommendedModelId ?? ''
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (
      !agentApi ||
      saving ||
      catalogUnavailable ||
      (editor.mode === 'provider' && providerUnavailable)
    )
      return

    const fields =
      editor.mode === 'provider'
        ? { kind: 'provider' as const, providerId, modelId: providerModelId, apiKey: editor.apiKey }
        : {
            kind: 'custom' as const,
            baseUrl: editor.baseUrl.trim(),
            modelId: editor.modelId.trim(),
            apiKey: editor.apiKey
          }
    setSaving(true)
    setEditorErrorMessage('')

    try {
      const response = editor.editingId
        ? await agentApi.updateAgentModelConfiguration({
            id: editor.editingId,
            ...fields
          } as AgentModelUpdateRequest)
        : await agentApi.createAgentModelConfiguration(fields as AgentModelCreateRequest)

      if (!response.success) {
        setEditorErrorMessage(response.message)
        return
      }

      if (response.configuration) {
        setConfigurations((current) =>
          editor.editingId
            ? current.map((item) =>
                item.id === response.configuration!.id ? response.configuration! : item
              )
            : [...current, response.configuration!]
        )
      }
      setEditorOpen(false)
      setEditor(initialEditorState())
    } catch (error: unknown) {
      setEditorErrorMessage(error instanceof Error ? error.message : '模型配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: AgentModelRegistryItem): Promise<void> => {
    if (!agentApi || deletingId) return
    setDeletingId(item.id)
    setPageErrorMessage('')
    try {
      const response = await agentApi.deleteAgentModelConfiguration(item.id)
      if (!response.success) {
        setPageErrorMessage(response.message)
        return
      }
      setConfigurations((current) =>
        current.filter((configuration) => configuration.id !== item.id)
      )
    } catch (error: unknown) {
      setPageErrorMessage(error instanceof Error ? error.message : '模型配置删除失败')
    } finally {
      setDeletingId(null)
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
            <button
              className="studio-settings__primary"
              type="button"
              onClick={openCreateEditor}
              disabled={!canOpenEditor}
            >
              <Plus size={15} strokeWidth={1.9} aria-hidden="true" />
              添加模型
            </button>
          </header>

          {fallbackNotice && (
            <p className="studio-settings__notice" role="status">
              {fallbackNotice}
            </p>
          )}
          {pageErrorMessage && !editorOpen && (
            <p className="studio-settings__error" role="alert">
              {pageErrorMessage}
            </p>
          )}

          <div className="studio-settings__table-wrap">
            <table className="studio-settings__table" aria-label="模型配置">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>类型</th>
                  <th>服务商 / 地址</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {configurations.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="studio-settings__model-name">{displayName(item)}</span>
                      <span className="studio-settings__model-id">{item.modelId}</span>
                    </td>
                    <td>{item.kind === 'provider' ? '模型服务商' : '自定义配置'}</td>
                    <td>{item.providerName ?? item.baseUrl}</td>
                    <td>
                      <div className="studio-settings__row-actions">
                        <button
                          type="button"
                          aria-label={`编辑 ${displayName(item)}`}
                          title="编辑"
                          onClick={() => openEditEditor(item)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`删除 ${displayName(item)}`}
                          title="删除"
                          disabled={deletingId === item.id}
                          onClick={() => void handleDelete(item)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!configurationsLoading && configurations.length === 0 && (
                  <tr>
                    <td className="studio-settings__empty" colSpan={4}>
                      暂无模型配置
                    </td>
                  </tr>
                )}
                {configurationsLoading && (
                  <tr>
                    <td className="studio-settings__empty" colSpan={4}>
                      正在加载模型配置...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editorOpen && (
        <div className="studio-settings__modal-backdrop">
          <section
            className="studio-settings__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-editor-title"
          >
            <header className="studio-settings__modal-header">
              <h2 id="model-editor-title">{editor.editingId ? '编辑模型' : '添加模型'}</h2>
              <button type="button" aria-label="关闭" title="关闭" onClick={closeEditor}>
                <X size={17} aria-hidden="true" />
              </button>
            </header>

            <div className="studio-settings__tabs" role="tablist" aria-label="配置方式">
              <button
                type="button"
                role="tab"
                aria-selected={editor.mode === 'provider'}
                className={editor.mode === 'provider' ? 'is-active' : ''}
                onClick={() => changeMode('provider')}
              >
                模型服务商
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editor.mode === 'custom'}
                className={editor.mode === 'custom' ? 'is-active' : ''}
                onClick={() => changeMode('custom')}
              >
                自定义配置
              </button>
            </div>

            <form className="studio-settings__editor-form" onSubmit={handleSubmit}>
              {editor.mode === 'provider' ? (
                <>
                  <label>
                    <span>大模型厂商</span>
                    <select
                      value={providerId}
                      disabled={providerUnavailable || saving}
                      onChange={(event) => handleProviderChange(event.target.value)}
                    >
                      {catalog?.providers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>模型</span>
                    <select
                      value={providerModelId}
                      disabled={providerUnavailable || saving}
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, modelId: event.target.value }))
                      }
                    >
                      {provider?.models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>API Key</span>
                    <input
                      type="password"
                      value={editor.apiKey}
                      disabled={providerUnavailable || saving}
                      placeholder={editor.editingId ? '留空以保留原密钥' : '输入 API Key'}
                      autoComplete="new-password"
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, apiKey: event.target.value }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span>Base URL</span>
                    <input
                      type="text"
                      value={editor.baseUrl}
                      disabled={saving}
                      placeholder="https://api.example.com/v1"
                      autoComplete="url"
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>模型 ID</span>
                    <input
                      type="text"
                      value={editor.modelId}
                      disabled={saving}
                      placeholder="输入模型 ID"
                      autoComplete="off"
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, modelId: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>API Key</span>
                    <input
                      type="password"
                      value={editor.apiKey}
                      disabled={saving}
                      placeholder={editor.editingId ? '留空以保留原密钥' : '输入 API Key'}
                      autoComplete="new-password"
                      onChange={(event) =>
                        setEditor((current) => ({ ...current, apiKey: event.target.value }))
                      }
                    />
                  </label>
                </>
              )}

              {(editorErrorMessage || pageErrorMessage) && (
                <p className="studio-settings__error" role="alert">
                  {editorErrorMessage || pageErrorMessage}
                </p>
              )}

              <div className="studio-settings__modal-actions">
                <button type="button" className="studio-settings__secondary" onClick={closeEditor}>
                  取消
                </button>
                <button
                  type="submit"
                  className="studio-settings__primary"
                  disabled={
                    saving ||
                    catalogUnavailable ||
                    (editor.mode === 'provider' && providerUnavailable)
                  }
                >
                  {saving ? '保存中...' : editor.editingId ? '保存' : '添加'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default SettingsView

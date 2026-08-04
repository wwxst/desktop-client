import { LoaderCircle, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'

import type {
  TtsCatalogResponse,
  TtsModelDownloadProgress,
  TtsModelInfo
} from '../../../../shared/tts'
import PluginDetailView from './PluginDetailView'
import PluginListView from './PluginListView'
import { getPluginPresentation } from './pluginPresentation'
import './Plugins.css'

const PLUGIN_ORDER = [
  'kokoro-multi-lang-v1_1',
  'kokoro-multi-lang-v1_0',
  'supertonic-3-int8-2026-05-11'
]

type ExtensionTab = 'plugins' | 'skills'

interface PluginsNotice {
  type: 'success' | 'error' | 'info'
  text: string
}

interface PluginsViewProps {
  onOpenTts?: () => void
}

function PluginsView({ onOpenTts = () => undefined }: PluginsViewProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<ExtensionTab>('plugins')
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [catalog, setCatalog] = useState<TtsCatalogResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [notice, setNotice] = useState<PluginsNotice | null>(null)
  const [activeActionId, setActiveActionId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<TtsModelDownloadProgress | null>(null)

  const refreshCatalog = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setCatalogError(null)

    try {
      const response = await window.api.listTtsCatalog()

      if (!response.success) {
        setCatalog(null)
        setCatalogError('本地插件目录读取失败')
        return
      }

      setCatalog(response)
    } catch {
      setCatalog(null)
      setCatalogError('本地插件目录读取失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    void window.api
      .listTtsCatalog()
      .then((response) => {
        if (!isMounted) {
          return
        }

        if (!response.success) {
          setCatalogError('本地插件目录读取失败')
          return
        }

        setCatalog(response)
      })
      .catch(() => {
        if (isMounted) {
          setCatalogError('本地插件目录读取失败')
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    const removeProgressListener = window.api.onTtsModelDownloadProgress((progress) => {
      setDownloadProgress(progress)
    })

    return () => {
      isMounted = false
      removeProgressListener()
    }
  }, [])

  // 目录中的每条模型记录都作为一个可独立安装、卸载和查看详情的插件。
  const models = useMemo(() => {
    const catalogModels = catalog?.models ?? []
    return [...catalogModels].sort((first, second) => {
      const firstIndex = PLUGIN_ORDER.indexOf(first.id)
      const secondIndex = PLUGIN_ORDER.indexOf(second.id)
      return (
        (firstIndex === -1 ? PLUGIN_ORDER.length : firstIndex) -
        (secondIndex === -1 ? PLUGIN_ORDER.length : secondIndex)
      )
    })
  }, [catalog])

  const catalogBusyPlugin = models.find(
    (model) => model.status === 'downloading' || model.status === 'extracting'
  )
  const busyPluginId = activeActionId ?? catalogBusyPlugin?.id ?? null
  const selectedModel = models.find((model) => model.id === selectedPluginId) ?? null
  const normalizedSearch = searchText.trim().toLowerCase()
  const visibleModels = models.filter((model) => {
    if (!normalizedSearch) {
      return true
    }

    const presentation = getPluginPresentation(model)
    return `${presentation.name} ${presentation.description}`
      .toLowerCase()
      .includes(normalizedSearch)
  })

  const handleInstall = async (model: TtsModelInfo): Promise<void> => {
    const pluginName = getPluginPresentation(model).name
    setDownloadProgress(null)
    setActiveActionId(model.id)
    setNotice({ type: 'info', text: `正在下载${pluginName}，请保持网络连接` })

    try {
      const response = await window.api.installTtsModel(model.id)
      setNotice({
        type: response.success ? 'success' : 'error',
        text: response.success ? `${pluginName}安装完成` : `${pluginName}安装失败，请重试`
      })
      await refreshCatalog()
    } catch {
      setNotice({ type: 'error', text: `${pluginName}安装失败，请重试` })
      await refreshCatalog()
    } finally {
      setActiveActionId(null)
    }
  }

  const handleRemove = async (model: TtsModelInfo): Promise<void> => {
    const pluginName = getPluginPresentation(model).name
    if (!window.confirm(`确定卸载“${pluginName}”吗？`)) {
      return
    }

    setActiveActionId(model.id)

    try {
      const response = await window.api.removeTtsModel(model.id)
      setNotice({
        type: response.success ? 'success' : 'error',
        text: response.success ? `${pluginName}已卸载` : `${pluginName}卸载失败，请重试`
      })
    } catch {
      setNotice({ type: 'error', text: `${pluginName}卸载失败，请重试` })
    } finally {
      await refreshCatalog()
      setActiveActionId(null)
    }
  }

  const handleOpenModelDirectory = async (): Promise<void> => {
    try {
      const response = await window.api.openTtsModelDirectory()
      if (!response.success) {
        setNotice({ type: 'error', text: '插件目录打开失败，请重试' })
      }
    } catch {
      setNotice({ type: 'error', text: '插件目录打开失败，请重试' })
    }
  }

  if (selectedModel) {
    return (
      <section className="plugins-page" aria-label="插件中心">
        <div className="plugins-page__shell">
          {notice && (
            <div className={`plugins-notice plugins-notice--${notice.type}`} role="status">
              {notice.text}
            </div>
          )}
          <PluginDetailView
            model={selectedModel}
            busyPluginId={busyPluginId}
            downloadProgress={downloadProgress}
            onBack={() => setSelectedPluginId(null)}
            onInstall={(model) => void handleInstall(model)}
            onRemove={(model) => void handleRemove(model)}
            onOpenTts={onOpenTts}
            onOpenDirectory={() => void handleOpenModelDirectory()}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="plugins-page" aria-label="插件中心">
      <div className="plugins-page__shell">
        <div className="plugins-page__tabs" role="tablist" aria-label="扩展类型">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'plugins'}
            className={activeTab === 'plugins' ? 'is-active' : undefined}
            onClick={() => setActiveTab('plugins')}
          >
            插件
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'skills'}
            className={activeTab === 'skills' ? 'is-active' : undefined}
            onClick={() => {
              setSelectedPluginId(null)
              setActiveTab('skills')
            }}
          >
            技能
          </button>
        </div>

        <header className="plugins-page__header">
          <h1>{activeTab === 'plugins' ? '插件' : '技能'}</h1>
          <p>
            {activeTab === 'plugins'
              ? '安装本地创作能力，让常用工具按需扩展'
              : '集中管理可以复用的创作流程'}
          </p>
        </header>

        {activeTab === 'plugins' ? (
          <>
            <label className="plugins-page__search">
              <Search size={17} strokeWidth={1.7} aria-hidden="true" />
              <input
                type="search"
                aria-label="搜索插件"
                placeholder="搜索插件"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </label>

            {notice && (
              <div className={`plugins-notice plugins-notice--${notice.type}`} role="status">
                {notice.text}
              </div>
            )}

            {isLoading && !catalog ? (
              <div className="plugins-empty-state" role="status">
                <LoaderCircle className="plugins-spin" size={22} aria-hidden="true" />
                <span>正在读取插件状态</span>
              </div>
            ) : catalogError ? (
              <div className="plugins-empty-state" role="alert">
                <strong>插件状态读取失败</strong>
                <span>{catalogError}</span>
                <button type="button" onClick={() => void refreshCatalog()}>
                  重新加载
                </button>
              </div>
            ) : visibleModels.length === 0 ? (
              <div className="plugins-empty-state">
                <span>没有找到相关插件</span>
              </div>
            ) : (
              <PluginListView
                models={visibleModels}
                busyPluginId={busyPluginId}
                downloadProgress={downloadProgress}
                onOpenDetail={(model) => setSelectedPluginId(model.id)}
                onInstall={(model) => void handleInstall(model)}
                onRemove={(model) => void handleRemove(model)}
              />
            )}
          </>
        ) : (
          <div className="plugins-empty-state plugins-empty-state--skills">
            <span>暂无可用技能</span>
          </div>
        )}
      </div>
    </section>
  )
}

export default PluginsView

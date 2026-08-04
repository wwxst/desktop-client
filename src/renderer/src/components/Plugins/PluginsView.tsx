import { LoaderCircle, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'

import type {
  TtsCatalogResponse,
  TtsModelDownloadProgress,
  TtsModelInfo
} from '../../../../shared/tts'
import PluginDetailView from './PluginDetailView'
import PluginListView from './PluginListView'
import { getPluginResourcePresentation } from './pluginResources'
import './Plugins.css'

const DEFAULT_TTS_RESOURCE_ID = 'kokoro-multi-lang-v1_1'

const RESOURCE_ORDER = [
  'kokoro-multi-lang-v1_1',
  'kokoro-multi-lang-v1_0',
  'supertonic-3-int8-2026-05-11'
]

type ExtensionTab = 'plugins' | 'skills'
type SelectedPlugin = 'local-tts' | null

interface PluginsNotice {
  type: 'success' | 'error' | 'info'
  text: string
}

function PluginsView(): JSX.Element {
  const [activeTab, setActiveTab] = useState<ExtensionTab>('plugins')
  const [selectedPlugin, setSelectedPlugin] = useState<SelectedPlugin>(null)
  const [searchText, setSearchText] = useState('')
  const [catalog, setCatalog] = useState<TtsCatalogResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [notice, setNotice] = useState<PluginsNotice | null>(null)
  const [activeActionId, setActiveActionId] = useState<string | null>(null)
  const [pluginActionRunning, setPluginActionRunning] = useState(false)
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

  const models = useMemo(() => {
    const catalogModels = catalog?.models ?? []
    return [...catalogModels].sort((first, second) => {
      const firstIndex = RESOURCE_ORDER.indexOf(first.id)
      const secondIndex = RESOURCE_ORDER.indexOf(second.id)
      return (
        (firstIndex === -1 ? RESOURCE_ORDER.length : firstIndex) -
        (secondIndex === -1 ? RESOURCE_ORDER.length : secondIndex)
      )
    })
  }, [catalog])

  const installed = models.some((model) => model.status === 'installed')
  const failed = models.some((model) => model.status === 'failed')
  const catalogBusyResource = models.find(
    (model) => model.status === 'downloading' || model.status === 'extracting'
  )
  const busyResourceId = activeActionId ?? catalogBusyResource?.id ?? null
  const busy = busyResourceId !== null || pluginActionRunning
  const normalizedSearch = searchText.trim().toLowerCase()
  const pluginMatchesSearch =
    !normalizedSearch ||
    '本地 tts 配音'.includes(normalizedSearch) ||
    '在电脑本地完成文本配音，内容无需上传服务器'.includes(normalizedSearch)
  const defaultResource = models.find((model) => model.id === DEFAULT_TTS_RESOURCE_ID) ?? null
  const pluginStatus = busyResourceId
    ? '处理中'
    : installed
      ? '已安装'
      : failed
        ? '安装失败'
        : '未安装'

  const handleInstall = async (modelId: string): Promise<void> => {
    const resource = models.find((model) => model.id === modelId)
    const resourceName = resource ? getPluginResourcePresentation(resource).name : '语音资源'
    setDownloadProgress(null)
    setActiveActionId(modelId)
    setNotice({ type: 'info', text: '正在下载语音资源，请保持网络连接' })

    try {
      const response = await window.api.installTtsModel(modelId)
      setNotice({
        type: response.success ? 'success' : 'error',
        text: response.success ? `${resourceName}安装完成` : `${resourceName}安装失败，请重试`
      })
      await refreshCatalog()
    } catch {
      setNotice({ type: 'error', text: '语音资源安装失败，请重试' })
      await refreshCatalog()
    } finally {
      setActiveActionId(null)
    }
  }

  const handleRemoveResource = async (model: TtsModelInfo): Promise<void> => {
    const resourceName = getPluginResourcePresentation(model).name
    if (!window.confirm(`确定卸载“${resourceName}”吗？`)) {
      return
    }

    setActiveActionId(model.id)

    try {
      const response = await window.api.removeTtsModel(model.id)
      setNotice({
        type: response.success ? 'success' : 'error',
        text: response.success ? `${resourceName}已卸载` : `${resourceName}卸载失败，请重试`
      })
    } catch {
      setNotice({ type: 'error', text: `${resourceName}卸载失败，请重试` })
    } finally {
      await refreshCatalog()
      setActiveActionId(null)
    }
  }

  const handleRemovePlugin = async (): Promise<void> => {
    const installedResources = models.filter((model) => model.status === 'installed')
    if (
      installedResources.length === 0 ||
      !window.confirm('确定卸载“本地 TTS 配音”吗？已下载的语音资源将一并删除。')
    ) {
      return
    }

    setPluginActionRunning(true)

    try {
      const results: boolean[] = []
      for (const resource of installedResources) {
        try {
          const response = await window.api.removeTtsModel(resource.id)
          results.push(response.success)
        } catch {
          results.push(false)
        }
      }

      const removedAll = results.every(Boolean)
      setNotice({
        type: removedAll ? 'success' : 'error',
        text: removedAll ? '本地 TTS 配音已卸载' : '部分语音资源卸载失败，请重试'
      })
    } catch {
      setNotice({ type: 'error', text: '部分语音资源卸载失败，请重试' })
    } finally {
      await refreshCatalog()
      setPluginActionRunning(false)
    }
  }

  if (selectedPlugin === 'local-tts') {
    return (
      <section className="plugins-page" aria-label="插件中心">
        <div className="plugins-page__shell">
          {notice && (
            <div className={`plugins-notice plugins-notice--${notice.type}`} role="status">
              {notice.text}
            </div>
          )}
          <PluginDetailView
            models={models}
            installed={installed}
            failed={failed}
            busyResourceId={busyResourceId}
            pluginActionRunning={pluginActionRunning}
            defaultResource={defaultResource}
            downloadProgress={downloadProgress}
            onBack={() => setSelectedPlugin(null)}
            onInstall={(modelId) => void handleInstall(modelId)}
            onRemoveResource={(model) => void handleRemoveResource(model)}
            onRemovePlugin={() => void handleRemovePlugin()}
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
              setSelectedPlugin(null)
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
            ) : !pluginMatchesSearch ? (
              <div className="plugins-empty-state">
                <span>没有找到相关插件</span>
              </div>
            ) : (
              <PluginListView
                installed={installed}
                failed={failed}
                busy={busy}
                canInstall={defaultResource !== null}
                statusLabel={pluginStatus}
                onOpenDetail={() => setSelectedPlugin('local-tts')}
                onInstall={() => defaultResource && void handleInstall(defaultResource.id)}
                onRemove={() => void handleRemovePlugin()}
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

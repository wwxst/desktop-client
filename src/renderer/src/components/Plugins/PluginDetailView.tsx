import { Check, ChevronRight, Download, LoaderCircle, Mic2 } from 'lucide-react'
import type { JSX } from 'react'

import type { TtsModelDownloadProgress, TtsModelInfo } from '../../../../shared/tts'
import PluginActionMenu from './PluginActionMenu'
import { getPluginResourcePresentation } from './pluginResources'

interface PluginDetailViewProps {
  models: TtsModelInfo[]
  installed: boolean
  failed: boolean
  busyResourceId: string | null
  pluginActionRunning: boolean
  defaultResource: TtsModelInfo | null
  downloadProgress: TtsModelDownloadProgress | null
  onBack: () => void
  onInstall: (modelId: string) => void
  onRemoveResource: (model: TtsModelInfo) => void
  onRemovePlugin: () => void
}

function PluginDetailView({
  models,
  installed,
  failed,
  busyResourceId,
  pluginActionRunning,
  defaultResource,
  downloadProgress,
  onBack,
  onInstall,
  onRemoveResource,
  onRemovePlugin
}: PluginDetailViewProps): JSX.Element {
  const busy = busyResourceId !== null || pluginActionRunning
  const installing = !installed && busyResourceId !== null
  const installedSize = models
    .filter((model) => model.status === 'installed')
    .reduce((total, model) => total + model.estimatedDownloadMb, 0)

  return (
    <section className="plugin-detail" aria-label="本地 TTS 配音详情">
      <nav className="plugin-detail__breadcrumb" aria-label="面包屑">
        <button type="button" aria-label="返回插件列表" onClick={onBack}>
          插件
        </button>
        <ChevronRight size={14} strokeWidth={1.7} aria-hidden="true" />
        <span>本地 TTS 配音</span>
      </nav>

      <header className="plugin-detail__header">
        <span className="plugin-detail__icon" aria-hidden="true">
          <Mic2 size={28} strokeWidth={1.65} />
        </span>
        <div className="plugin-detail__intro">
          <h1>本地 TTS 配音</h1>
          <p>在电脑本地完成文本配音，内容无需上传服务器</p>
          <span
            className={installed ? 'is-installed' : !installing && failed ? 'is-failed' : undefined}
          >
            {installed ? '已安装' : installing ? '安装中' : failed ? '安装失败' : '未安装'}
          </span>
        </div>
        <div className="plugin-detail__primary-action">
          {installed ? (
            <PluginActionMenu label="本地 TTS 配音" disabled={busy} onRemove={onRemovePlugin} />
          ) : (
            <button
              className="plugin-install-button"
              type="button"
              aria-label="安装本地 TTS 配音"
              disabled={!defaultResource || busy}
              onClick={() => defaultResource && onInstall(defaultResource.id)}
            >
              {busy ? (
                <LoaderCircle className="plugins-spin" size={15} aria-hidden="true" />
              ) : (
                <Download size={15} strokeWidth={1.8} aria-hidden="true" />
              )}
              {failed ? '重试' : '安装'}
            </button>
          )}
        </div>
      </header>

      <section className="plugin-detail__section" aria-labelledby="plugin-resources-title">
        <div className="plugin-detail__section-heading">
          <h2 id="plugin-resources-title">语音资源</h2>
          <p>按创作语言安装需要的音色</p>
        </div>

        <div className="plugin-resource-list">
          {models.map((model) => {
            const presentation = getPluginResourcePresentation(model)
            const isResourceBusy = busyResourceId === model.id
            const progress = downloadProgress?.modelId === model.id ? downloadProgress : null
            const isInstalled = model.status === 'installed'
            const isFailed = model.status === 'failed'

            return (
              <article className="plugin-resource-item" key={model.id}>
                <div className="plugin-resource-item__copy">
                  <strong>{presentation.name}</strong>
                  <span>{presentation.description}</span>
                  <small>
                    {model.voiceCount} 个音色 · 约 {model.estimatedDownloadMb} MB
                  </small>
                </div>

                <div className="plugin-resource-item__status">
                  {isInstalled ? (
                    <span className="is-installed">
                      <Check size={13} strokeWidth={2} aria-hidden="true" />
                      已安装
                    </span>
                  ) : isResourceBusy ? (
                    <span>处理中</span>
                  ) : isFailed ? (
                    <span className="is-failed">安装失败</span>
                  ) : (
                    <span>未安装</span>
                  )}
                </div>

                <div className="plugin-resource-item__action">
                  {isInstalled ? (
                    <PluginActionMenu
                      label={presentation.name}
                      disabled={busy}
                      onRemove={() => onRemoveResource(model)}
                    />
                  ) : (
                    <button
                      className="plugin-install-button plugin-install-button--resource"
                      type="button"
                      aria-label={`${isFailed ? '重试安装' : '安装'}${presentation.name}`}
                      disabled={busy}
                      onClick={() => onInstall(model.id)}
                    >
                      {isResourceBusy ? (
                        <LoaderCircle className="plugins-spin" size={14} aria-hidden="true" />
                      ) : (
                        <Download size={14} strokeWidth={1.8} aria-hidden="true" />
                      )}
                      {isFailed ? '重试' : '安装'}
                    </button>
                  )}
                </div>

                {isResourceBusy && (
                  <div className="plugin-resource-item__progress" role="status">
                    <div className="plugins-progress" aria-hidden="true">
                      <span style={{ width: `${progress?.percent ?? 0}%` }} />
                    </div>
                    <small>{progress ? `${Math.round(progress.percent)}%` : '准备中'}</small>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="plugin-detail__section" aria-labelledby="plugin-information-title">
        <div className="plugin-detail__section-heading">
          <h2 id="plugin-information-title">信息</h2>
        </div>
        <dl className="plugin-information">
          <div>
            <dt>处理方式</dt>
            <dd>本地离线处理</dd>
          </div>
          <div>
            <dt>文本传输</dt>
            <dd>无需上传服务器</dd>
          </div>
          <div>
            <dt>资源占用</dt>
            <dd>{installedSize > 0 ? `约 ${installedSize} MB` : '尚未占用空间'}</dd>
          </div>
        </dl>
      </section>
    </section>
  )
}

export default PluginDetailView

import { Check, Download, Mic2 } from 'lucide-react'
import type { JSX } from 'react'

import type { TtsModelDownloadProgress, TtsModelInfo } from '../../../../shared/tts'
import Button from '../ui/Button'
import PluginActionMenu from './PluginActionMenu'
import { getPluginPresentation } from './pluginPresentation'

interface PluginListViewProps {
  models: TtsModelInfo[]
  busyPluginId: string | null
  downloadProgress: TtsModelDownloadProgress | null
  onOpenDetail: (model: TtsModelInfo) => void
  onInstall: (model: TtsModelInfo) => void
  onRemove: (model: TtsModelInfo) => void
}

interface PluginSectionProps extends PluginListViewProps {
  title: string
  ariaLabel: string
}

function PluginSection({
  title,
  ariaLabel,
  models,
  busyPluginId,
  downloadProgress,
  onOpenDetail,
  onInstall,
  onRemove
}: PluginSectionProps): JSX.Element {
  return (
    <section
      className="plugins-catalog-section plugins-catalog-section--compact"
      aria-label={ariaLabel}
    >
      <div className="plugins-catalog-section__heading">
        <h2>{title}</h2>
        <span>{models.length} 个插件</span>
      </div>

      {/* 一条模型记录就是一个插件；网格在常规宽度下一行展示两个插件。 */}
      <div className="plugins-catalog-section__grid">
        {models.map((model) => {
          const presentation = getPluginPresentation(model)
          const installed = model.status === 'installed'
          const failed = model.status === 'failed'
          const processing = model.status === 'downloading' || model.status === 'extracting'
          const isBusy = busyPluginId === model.id || processing
          const anotherPluginBusy = busyPluginId !== null && !isBusy
          const progress = downloadProgress?.modelId === model.id ? downloadProgress : null
          const showStatus = installed || isBusy || failed

          return (
            <article className="plugin-list-item" key={model.id}>
              <button
                className="plugin-list-item__open"
                type="button"
                aria-label={`查看${presentation.name}详情`}
                onClick={() => onOpenDetail(model)}
              >
                <span className="plugin-list-item__icon" aria-hidden="true">
                  <Mic2 size={21} strokeWidth={1.7} />
                </span>
                <span className="plugin-list-item__copy">
                  <strong>{presentation.name}</strong>
                  <small>{presentation.description}</small>
                </span>
                {/* 安装按钮已经表达可安装状态，正常未安装时不重复显示状态。 */}
                {showStatus && (
                  <span
                    className={`plugin-list-item__status ${installed ? 'is-installed' : ''} ${!isBusy && failed ? 'is-failed' : ''}`}
                  >
                    {installed && <Check size={13} strokeWidth={2} aria-hidden="true" />}
                    {installed ? '已安装' : isBusy ? '处理中' : '安装失败'}
                  </span>
                )}
              </button>

              <div className="plugin-list-item__action">
                {installed ? (
                  <PluginActionMenu
                    label={presentation.name}
                    disabled={busyPluginId !== null}
                    onRemove={() => onRemove(model)}
                  />
                ) : (
                  <Button
                    className="plugin-list-item__install"
                    aria-label={`${failed ? '重试安装' : '安装'}${presentation.name}`}
                    icon={<Download strokeWidth={1.8} />}
                    loading={isBusy}
                    disabled={anotherPluginBusy}
                    onClick={() => onInstall(model)}
                  >
                    {failed ? '重试' : '安装'}
                  </Button>
                )}
              </div>

              {isBusy && (
                <div className="plugin-list-item__progress" role="status">
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
  )
}

function PluginListView(props: PluginListViewProps): JSX.Element {
  const installedModels = props.models.filter((model) => model.status === 'installed')
  const availableModels = props.models.filter((model) => model.status !== 'installed')

  return (
    <>
      {installedModels.length > 0 && (
        <PluginSection {...props} title="已安装" ariaLabel="已安装插件" models={installedModels} />
      )}
      {availableModels.length > 0 && (
        <PluginSection {...props} title="可安装" ariaLabel="可安装插件" models={availableModels} />
      )}
    </>
  )
}

export default PluginListView

import { Check, Download, LoaderCircle, Mic2 } from 'lucide-react'
import type { JSX } from 'react'

import PluginActionMenu from './PluginActionMenu'

interface PluginListViewProps {
  installed: boolean
  failed: boolean
  busy: boolean
  canInstall: boolean
  statusLabel: string
  onOpenDetail: () => void
  onInstall: () => void
  onRemove: () => void
}

function PluginListView({
  installed,
  failed,
  busy,
  canInstall,
  statusLabel,
  onOpenDetail,
  onInstall,
  onRemove
}: PluginListViewProps): JSX.Element {
  return (
    <section
      className={`plugins-catalog-section ${installed ? 'plugins-catalog-section--compact' : ''}`}
      aria-label={installed ? '已安装插件' : '可安装插件'}
    >
      <div className="plugins-catalog-section__heading">
        <h2>{installed ? '已安装' : '可安装'}</h2>
        <span>{installed ? '1 个插件' : '按需安装'}</span>
      </div>

      <article className="plugin-list-item">
        <button
          className="plugin-list-item__open"
          type="button"
          aria-label="查看本地 TTS 配音详情"
          onClick={onOpenDetail}
        >
          <span className="plugin-list-item__icon" aria-hidden="true">
            <Mic2 size={21} strokeWidth={1.7} />
          </span>
          <span className="plugin-list-item__copy">
            <strong>本地 TTS 配音</strong>
            <small>在电脑本地完成文本配音，内容无需上传服务器</small>
          </span>
          <span
            className={`plugin-list-item__status ${installed ? 'is-installed' : ''} ${failed && !installed ? 'is-failed' : ''}`}
          >
            {installed && <Check size={13} strokeWidth={2} aria-hidden="true" />}
            {statusLabel}
          </span>
        </button>

        <div className="plugin-list-item__action">
          {installed ? (
            <PluginActionMenu label="本地 TTS 配音" disabled={busy} onRemove={onRemove} />
          ) : (
            <button
              className="plugin-list-item__install"
              type="button"
              disabled={!canInstall || busy}
              onClick={onInstall}
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
      </article>
    </section>
  )
}

export default PluginListView

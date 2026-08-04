import { BadgeCheck, ChevronRight, Download, FolderOpen, Mic2 } from 'lucide-react'
import { useState, type JSX } from 'react'

import type { TtsModelDownloadProgress, TtsModelInfo } from '../../../../shared/tts'
import Button from '../ui/Button'
import PluginDetailActions from './PluginDetailActions'
import { getPluginLanguageNames, getPluginPresentation } from './pluginPresentation'

type PluginDetailTab = 'details' | 'features' | 'changelog'

const DETAIL_TABS: Array<{ id: PluginDetailTab; label: string }> = [
  { id: 'details', label: '详情' },
  { id: 'features', label: '功能' },
  { id: 'changelog', label: '更新日志' }
]

interface PluginDetailViewProps {
  model: TtsModelInfo
  busyPluginId: string | null
  downloadProgress: TtsModelDownloadProgress | null
  onBack: () => void
  onInstall: (model: TtsModelInfo) => void
  onRemove: (model: TtsModelInfo) => void
  onOpenTts: () => void
  onOpenDirectory: () => void
}

function PluginDetailView({
  model,
  busyPluginId,
  downloadProgress,
  onBack,
  onInstall,
  onRemove,
  onOpenTts,
  onOpenDirectory
}: PluginDetailViewProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<PluginDetailTab>('details')
  const presentation = getPluginPresentation(model)
  const languageNames = getPluginLanguageNames(model)
  const installed = model.status === 'installed'
  const failed = model.status === 'failed'
  const processing = model.status === 'downloading' || model.status === 'extracting'
  const isBusy = busyPluginId === model.id || processing
  const anotherPluginBusy = busyPluginId !== null && !isBusy
  const progress = downloadProgress?.modelId === model.id ? downloadProgress : null
  const statusLabel = installed ? '已安装' : isBusy ? '安装中' : failed ? '安装失败' : '可安装'

  return (
    <section className="plugin-detail" aria-label={`${presentation.name}详情`}>
      <nav className="plugin-detail__breadcrumb" aria-label="面包屑">
        <button type="button" aria-label="返回插件列表" onClick={onBack}>
          插件
        </button>
        <ChevronRight size={14} strokeWidth={1.7} aria-hidden="true" />
        <span>{presentation.name}</span>
      </nav>

      <header className="plugin-detail__header">
        <span className="plugin-detail__icon" aria-hidden="true">
          <Mic2 size={39} strokeWidth={1.55} />
        </span>
        <div className="plugin-detail__intro">
          <h1>{presentation.name}</h1>
          <div className="plugin-detail__metadata" aria-label="插件摘要">
            <span className="plugin-detail__publisher">
              桌面端官方
              <BadgeCheck size={14} strokeWidth={1.8} aria-label="已验证" />
            </span>
            <i aria-hidden="true" />
            <span>版本 {presentation.version}</span>
            <i aria-hidden="true" />
            <span>{model.voiceCount} 个音色</span>
          </div>
          <p>{presentation.description}</p>
          {(installed || isBusy || failed) && (
            <span
              className={`plugin-detail__status ${installed ? 'is-installed' : !isBusy && failed ? 'is-failed' : ''}`}
            >
              {installed ? '已安装' : isBusy ? '安装中' : '安装失败'}
            </span>
          )}

          {installed ? (
            <PluginDetailActions
              pluginName={presentation.name}
              disabled={busyPluginId !== null}
              onOpenTts={onOpenTts}
              onRemove={() => onRemove(model)}
              onOpenDirectory={onOpenDirectory}
            />
          ) : (
            <div className="plugin-detail-actions" aria-label="插件操作">
              <Button
                size="sm"
                aria-label={`${failed ? '重试安装' : '安装'}${presentation.name}`}
                disabled={anotherPluginBusy}
                icon={<Download strokeWidth={1.8} />}
                loading={isBusy}
                onClick={() => onInstall(model)}
              >
                {failed ? '重试' : '安装'}
              </Button>
            </div>
          )}
        </div>
      </header>

      {isBusy && (
        <div className="plugin-detail__progress" role="status">
          <div className="plugins-progress" aria-hidden="true">
            <span style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <small>{progress ? `${Math.round(progress.percent)}%` : '准备中'}</small>
        </div>
      )}

      <div className="plugin-detail__tabs" role="tablist" aria-label="插件详情视图">
        {DETAIL_TABS.map((tab) => (
          <button
            id={`plugin-${tab.id}-tab`}
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`plugin-${tab.id}-panel`}
            className={activeTab === tab.id ? 'is-active' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="plugin-detail__body">
        <main
          id={`plugin-${activeTab}-panel`}
          className="plugin-detail__main"
          role="tabpanel"
          aria-labelledby={`plugin-${activeTab}-tab`}
        >
          {activeTab === 'details' && (
            <>
              <header className="plugin-detail__article-header">
                <h2>关于{presentation.name}</h2>
                <p>{presentation.overview}</p>
              </header>

              <section className="plugin-detail__article-section">
                <h3>适用场景</h3>
                <p>
                  {presentation.description}。可用于视频旁白、角色对白、知识讲解和批量内容制作。
                </p>
              </section>

              <section className="plugin-detail__article-section">
                <h3>使用方法</h3>
                <p>安装后进入 TTS 配音，选择文本语言和该插件提供的音色，即可试听并生成配音。</p>
              </section>

              <section className="plugin-detail__article-section">
                <h3>本地处理</h3>
                <p>文本和生成过程均在当前电脑完成，无需将配音文案上传到服务器。</p>
              </section>

              <section className="plugin-detail__article-section">
                <h3>许可协议</h3>
                <p>
                  本插件使用 {model.licenseName} 许可协议。{model.licenseNote}
                </p>
              </section>
            </>
          )}

          {activeTab === 'features' && (
            <>
              <header className="plugin-detail__article-header">
                <h2>功能</h2>
                <p>该插件提供的语言、音色和本地处理能力。</p>
              </header>
              <dl className="plugin-detail__feature-list">
                <div>
                  <dt>音色库</dt>
                  <dd>提供 {model.voiceCount} 个可选音色，适配不同内容风格。</dd>
                </div>
                <div>
                  <dt>语言支持</dt>
                  <dd>{languageNames.join('、')}</dd>
                </div>
                <div>
                  <dt>离线生成</dt>
                  <dd>模型安装完成后，可在本地完成试听和正式配音。</dd>
                </div>
                <div>
                  <dt>内容安全</dt>
                  <dd>配音文本无需上传服务器，适合处理内部或未发布内容。</dd>
                </div>
              </dl>
            </>
          )}

          {activeTab === 'changelog' && (
            <>
              <header className="plugin-detail__article-header">
                <h2>更新日志</h2>
                <p>当前随桌面客户端提供的插件版本。</p>
              </header>
              <article className="plugin-detail__release">
                <header>
                  <strong>版本 {presentation.version}</strong>
                  <span>当前版本</span>
                </header>
                <ul>
                  <li>提供 {model.voiceCount} 个本地配音音色。</li>
                  <li>支持 {languageNames.join('、')}。</li>
                  <li>支持本地试听和长文本配音生成。</li>
                </ul>
              </article>
            </>
          )}
        </main>

        <aside className="plugin-detail__sidebar" aria-label="插件信息">
          <section>
            <h2>安装</h2>
            <dl>
              <div>
                <dt>状态</dt>
                <dd className={installed ? 'is-installed' : failed ? 'is-failed' : undefined}>
                  {statusLabel}
                </dd>
              </div>
              <div>
                <dt>标识符</dt>
                <dd>{presentation.identifier}</dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{presentation.version}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>约 {model.estimatedDownloadMb} MB</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>能力</h2>
            <dl>
              <div>
                <dt>音色</dt>
                <dd>{model.voiceCount} 个</dd>
              </div>
              <div>
                <dt>语言</dt>
                <dd>{languageNames.length} 种</dd>
              </div>
              <div>
                <dt>处理方式</dt>
                <dd>本地离线</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>分类</h2>
            <span className="plugin-detail__category">{presentation.category}</span>
          </section>

          <section>
            <h2>资源</h2>
            <button
              className="plugin-detail__resource-link"
              type="button"
              disabled={!installed || busyPluginId !== null}
              onClick={onOpenDirectory}
            >
              <FolderOpen size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>本地插件目录</span>
            </button>
            <span className="plugin-detail__license">{model.licenseName}</span>
          </section>
        </aside>
      </div>
    </section>
  )
}

export default PluginDetailView

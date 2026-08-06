import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Info,
  Layers3,
  ShieldCheck
} from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'

import {
  loadNovelProject,
  NOVEL_PROJECT_CHANGED_EVENT,
  validateNovelProject
} from './novelPromotionStorage'
import type { NovelPromotionProject } from './novelPromotionTypes'
import './NovelPromotion.css'

interface CheckItemProps {
  ready: boolean
  label: string
  detail: string
}

function CheckItem({ ready, label, detail }: CheckItemProps): JSX.Element {
  const Icon = ready ? CheckCircle2 : Circle

  return (
    <li className={ready ? 'novel-side-check is-ready' : 'novel-side-check'}>
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </li>
  )
}

function NovelPromotionSidePanel(): JSX.Element {
  const [project, setProject] = useState<NovelPromotionProject>(() => loadNovelProject())

  useEffect(() => {
    const handleProjectChanged = (event: Event): void => {
      const customEvent = event as CustomEvent<NovelPromotionProject>
      setProject(customEvent.detail)
    }

    window.addEventListener(NOVEL_PROJECT_CHANGED_EVENT, handleProjectChanged)
    return () => window.removeEventListener(NOVEL_PROJECT_CHANGED_EVENT, handleProjectChanged)
  }, [])

  const validation = useMemo(() => validateNovelProject(project), [project])
  const matchedCount = Math.min(project.audioItems.length, project.commands.length)

  return (
    <section className="novel-side-panel" aria-label="小说推文任务检查">
      <header className="novel-side-panel__header">
        <ClipboardCheck size={18} strokeWidth={1.8} aria-hidden="true" />
        <div>
          <h2>开始前检查</h2>
          <p>这里只检查需要替换的内容</p>
        </div>
      </header>

      <ul className="novel-side-checks">
        <CheckItem
          ready={validation.draftReady}
          label="剪映模板草稿"
          detail={project.draftName || '还没有选择草稿'}
        />
        <CheckItem
          ready={validation.audioReady}
          label="小说音频"
          detail={`已导入 ${project.audioItems.length} 个`}
        />
        <CheckItem
          ready={validation.commandsReady}
          label="小说口令"
          detail={`已匹配 ${matchedCount}/${project.audioItems.length} 个`}
        />
        <CheckItem
          ready={validation.materialsReady}
          label="视频素材"
          detail={`已读取 ${project.materialCount} 个`}
        />
        <CheckItem
          ready={validation.outputReady}
          label="成品目录"
          detail={project.outputDirectory || '还没有填写输出目录'}
        />
      </ul>

      <div className="novel-side-summary">
        <div>
          <span>准备生成</span>
          <strong>{project.audioItems.length} 条</strong>
        </div>
        <div>
          <span>字幕处理</span>
          <strong>{project.autoSubtitle ? '音频自动转字幕' : '已关闭'}</strong>
        </div>
        <div>
          <span>工作方式</span>
          <strong>同一草稿循环替换</strong>
        </div>
      </div>

      <div className="novel-side-protected">
        <ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" />
        <div>
          <strong>固定内容保持不动</strong>
          <p>APP名称、APP图标、引导话术、字体、位置和动画全部沿用用户做好的剪映草稿。</p>
        </div>
      </div>

      <div className={validation.canStart ? 'novel-side-ready is-ready' : 'novel-side-ready'}>
        <Layers3 size={17} strokeWidth={1.8} aria-hidden="true" />
        <span>{validation.canStart ? '配置完成，可以开始批量生成。' : '把未完成项目补齐后即可开始。'}</span>
      </div>

      <div className="novel-side-tip">
        <Info size={15} strokeWidth={1.8} aria-hidden="true" />
        <p>当前页面已按真实业务整理；真正写入剪映草稿和调用导出，需要继续接入 Electron 主进程执行器。</p>
      </div>
    </section>
  )
}

export default NovelPromotionSidePanel

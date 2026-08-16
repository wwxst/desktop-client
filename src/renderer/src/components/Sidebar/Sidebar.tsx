import { useEffect, useState, type FormEvent, type JSX } from 'react'
import {
  BookOpen,
  Clapperboard,
  FolderOpen,
  MoreHorizontal,
  Mic2,
  Plus,
  Plug,
  Settings,
  SquarePen,
  X,
  type LucideIcon
} from 'lucide-react'
import type { WorkspaceMenu } from '../../workspaceNavigation'
import type { ProjectSummary } from '../../../../shared/project'
import './Sidebar.css'

interface SidebarMenuItem {
  id: WorkspaceMenu
  label: string
  icon: LucideIcon
}

interface SidebarProps {
  activeItem: WorkspaceMenu
  onItemSelect: (item: WorkspaceMenu) => void
  onSettingsSelect?: () => void
}

type ProjectSortMode = 'recent' | 'name' | 'manual'
type ConversationSortMode = 'priority' | 'recent' | 'manual'
type SidebarOrganization = 'project' | 'list'

const primaryMenuItems: SidebarMenuItem[] = [
  { id: 'home', label: '新任务', icon: SquarePen },
  { id: 'plugins', label: '插件', icon: Plug }
]

const productionMenuItems: SidebarMenuItem[] = [
  { id: 'novel-promotion', label: '小说推文', icon: BookOpen },
  { id: 'tts-voiceover', label: 'TTS 配音', icon: Mic2 },
  { id: 'media-library', label: '素材库', icon: FolderOpen }
]

function MenuItems({
  items,
  activeItem,
  onItemSelect
}: {
  items: SidebarMenuItem[]
  activeItem: WorkspaceMenu
  onItemSelect: (item: WorkspaceMenu) => void
}): JSX.Element {
  return (
    <ul className="studio-sidebar__menu">
      {items.map((item) => {
        const Icon = item.icon

        return (
          <li key={item.id}>
            <button
              className="studio-sidebar__menu-item"
              type="button"
              aria-current={activeItem === item.id ? 'page' : undefined}
              onClick={() => onItemSelect(item.id)}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SectionHeader({
  id,
  label,
  onMore,
  onCreate
}: {
  id: string
  label: string
  onMore: () => void
  onCreate: () => void
}): JSX.Element {
  return (
    <div className="studio-sidebar__section-header">
      <h2 id={id}>{label}</h2>
      <div className="studio-sidebar__section-actions">
        <button
          className="studio-sidebar__section-action"
          type="button"
          aria-label={`${label}选项`}
          title={`${label}选项`}
          onClick={onMore}
        >
          <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          className="studio-sidebar__section-action"
          type="button"
          aria-label={label === '项目' ? '新建项目' : '新建对话'}
          title={label === '项目' ? '新建项目' : '新建对话'}
          onClick={onCreate}
        >
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function SortMenu({
  label,
  options,
  current,
  organization,
  onOrganizationSelect,
  onSelect
}: {
  label: string
  options: readonly { value: string; label: string }[]
  current: string
  organization: SidebarOrganization
  onOrganizationSelect: (value: SidebarOrganization) => void
  onSelect: (value: string) => void
}): JSX.Element {
  return (
    <div className="studio-sidebar__sort-menu" role="menu" aria-label={`${label}设置`}>
      <span className="studio-sidebar__sort-title">整理侧边栏</span>
      {(
        [
          { value: 'project', label: '按项目' },
          { value: 'list', label: '在一个列表中' }
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={organization === option.value}
          onClick={() => onOrganizationSelect(option.value)}
        >
          <span aria-hidden="true">{organization === option.value ? '✓' : ''}</span>
          {option.label}
        </button>
      ))}
      <div className="studio-sidebar__sort-divider" />
      <span className="studio-sidebar__sort-title">{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={current === option.value}
          onClick={() => onSelect(option.value)}
        >
          <span aria-hidden="true">{current === option.value ? '✓' : ''}</span>
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * 工作台左侧的主菜单。
 */
function Sidebar({ activeItem, onItemSelect, onSettingsSelect }: SidebarProps): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false)
  const [projectSortMode, setProjectSortMode] = useState<ProjectSortMode>('recent')
  const [conversationSortMode, setConversationSortMode] = useState<ConversationSortMode>('priority')
  const [sidebarOrganization, setSidebarOrganization] = useState<SidebarOrganization>('project')
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDirectory, setProjectDirectory] = useState('')
  const [projectDirectoryLabel, setProjectDirectoryLabel] = useState('')
  const [projectError, setProjectError] = useState('')
  const [projectBusy, setProjectBusy] = useState(false)

  useEffect(() => {
    let active = true
    if (!window.api?.listProjects) return undefined

    void window.api
      .listProjects()
      .then((response) => {
        if (!active) return
        if (response.success) setProjects(response.projects)
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!projectMenuOpen && !conversationMenuOpen) return undefined
    const closeMenus = (event: PointerEvent): void => {
      const target = event.target as HTMLElement
      if (!target.closest('.studio-sidebar__section-tools')) {
        setProjectMenuOpen(false)
        setConversationMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeMenus)
    return () => document.removeEventListener('pointerdown', closeMenus)
  }, [conversationMenuOpen, projectMenuOpen])

  const openProjectDialog = (): void => {
    setProjectMenuOpen(false)
    setConversationMenuOpen(false)
    setProjectName('')
    setProjectDirectory('')
    setProjectDirectoryLabel('')
    setProjectError('')
    setProjectDialogOpen(true)
  }

  const closeProjectDialog = (): void => setProjectDialogOpen(false)

  const selectProjectDirectory = async (): Promise<void> => {
    setProjectError('')
    setProjectBusy(true)
    try {
      const response = await window.api.selectProjectDirectory()
      if (!response.success) {
        setProjectError(response.message)
      } else if (!response.canceled && response.directoryPath) {
        setProjectDirectory(response.directoryPath)
        setProjectDirectoryLabel(response.directoryName || response.directoryPath)
      }
    } catch {
      setProjectError('无法打开文件夹选择框，请稍后重试')
    } finally {
      setProjectBusy(false)
    }
  }

  const createProject = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const name = projectName.trim()
    if (!name || !projectDirectory) return

    setProjectError('')
    setProjectBusy(true)
    try {
      const response = await window.api.createProject({ name, rootDirectory: projectDirectory })
      setProjects(response.projects)
      if (response.success) closeProjectDialog()
      else setProjectError(response.message)
    } catch {
      setProjectError('创建项目失败，请稍后重试')
    } finally {
      setProjectBusy(false)
    }
  }

  const visibleProjects = [...projects].sort((left, right) => {
    if (projectSortMode === 'name') return left.name.localeCompare(right.name, 'zh-CN')
    if (projectSortMode === 'recent') return right.updatedAt.localeCompare(left.updatedAt)
    return 0
  })

  return (
    <nav className="studio-sidebar" aria-label="主菜单">
      <div className="studio-sidebar__brand" aria-label="剪辑 Agent">
        <span className="studio-sidebar__brand-mark" aria-hidden="true">
          <Clapperboard size={16} strokeWidth={1.8} />
        </span>
        <strong>剪辑 Agent</strong>
      </div>

      <MenuItems items={primaryMenuItems} activeItem={activeItem} onItemSelect={onItemSelect} />

      <section className="studio-sidebar__section" aria-labelledby="production-tools-heading">
        <h2 id="production-tools-heading">制作工具</h2>
        <MenuItems
          items={productionMenuItems}
          activeItem={activeItem}
          onItemSelect={onItemSelect}
        />
      </section>

      <section className="studio-sidebar__section" aria-labelledby="project-heading">
        <div className="studio-sidebar__section-tools">
          <SectionHeader
            id="project-heading"
            label="项目"
            onMore={() => {
              setConversationMenuOpen(false)
              setProjectMenuOpen((current) => !current)
            }}
            onCreate={openProjectDialog}
          />
          {projectMenuOpen && (
            <SortMenu
              label="项目排序方式"
              current={projectSortMode}
              organization={sidebarOrganization}
              options={[
                { value: 'recent', label: '最近更新' },
                { value: 'name', label: '名称' },
                { value: 'manual', label: '手动排序' }
              ]}
              onOrganizationSelect={(value) => {
                setSidebarOrganization(value)
                setProjectMenuOpen(false)
              }}
              onSelect={(value) => {
                setProjectSortMode(value as ProjectSortMode)
                setProjectMenuOpen(false)
              }}
            />
          )}
        </div>
        {visibleProjects.length ? (
          <ul className="studio-sidebar__project-list">
            {visibleProjects.map((project) => (
              <li key={project.id}>
                <button
                  className="studio-sidebar__project-item"
                  type="button"
                  title={project.rootDirectory}
                >
                  <FolderOpen size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span>{project.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="studio-sidebar__empty-state">暂无项目</p>
        )}
      </section>

      <section className="studio-sidebar__section" aria-labelledby="conversation-heading">
        <div className="studio-sidebar__section-tools">
          <SectionHeader
            id="conversation-heading"
            label="对话"
            onMore={() => {
              setProjectMenuOpen(false)
              setConversationMenuOpen((current) => !current)
            }}
            onCreate={() => onItemSelect('home')}
          />
          {conversationMenuOpen && (
            <SortMenu
              label="对话排序方式"
              current={conversationSortMode}
              organization={sidebarOrganization}
              options={[
                { value: 'priority', label: '优先级' },
                { value: 'recent', label: '最近更新' },
                { value: 'manual', label: '手动排序' }
              ]}
              onOrganizationSelect={(value) => {
                setSidebarOrganization(value)
                setConversationMenuOpen(false)
              }}
              onSelect={(value) => {
                setConversationSortMode(value as ConversationSortMode)
                setConversationMenuOpen(false)
              }}
            />
          )}
        </div>
        <p className="studio-sidebar__empty-state">暂无对话</p>
      </section>

      <div className="studio-sidebar__user">
        <div className="studio-sidebar__avatar" aria-hidden="true">
          KA
        </div>

        <div className="studio-sidebar__identity">
          <span className="studio-sidebar__nickname">kasixmb</span>
          <span className="studio-sidebar__plan">Plus</span>
        </div>

        <button
          className="studio-sidebar__settings"
          type="button"
          aria-label="设置"
          title="设置"
          onClick={() => onSettingsSelect?.()}
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {projectDialogOpen && (
        <div className="studio-sidebar__dialog-backdrop" role="presentation">
          <section
            className="studio-sidebar__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-heading"
          >
            <div className="studio-sidebar__dialog-header">
              <h2 id="create-project-heading">创建项目</h2>
              <button
                className="studio-sidebar__dialog-close"
                type="button"
                aria-label="关闭创建项目"
                onClick={closeProjectDialog}
              >
                <X size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={createProject}>
              <label className="studio-sidebar__dialog-field">
                <span>项目名称</span>
                <input
                  autoFocus
                  value={projectName}
                  placeholder="例如：八月小说推文"
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </label>
              <div className="studio-sidebar__dialog-field">
                <span>项目文件夹</span>
                <button
                  className="studio-sidebar__folder-picker"
                  type="button"
                  disabled={projectBusy}
                  title={projectDirectory || undefined}
                  onClick={() => void selectProjectDirectory()}
                >
                  <FolderOpen size={16} strokeWidth={1.7} aria-hidden="true" />
                  <span>{projectDirectoryLabel || '选择项目文件夹'}</span>
                </button>
              </div>
              {projectError && (
                <p className="studio-sidebar__dialog-error" role="alert">
                  {projectError}
                </p>
              )}
              <div className="studio-sidebar__dialog-actions">
                <button
                  className="studio-sidebar__dialog-cancel"
                  type="button"
                  onClick={closeProjectDialog}
                >
                  取消
                </button>
                <button
                  className="studio-sidebar__dialog-submit"
                  type="submit"
                  disabled={projectBusy || !projectName.trim() || !projectDirectory}
                >
                  {projectBusy ? '处理中' : '创建项目'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </nav>
  )
}

export default Sidebar

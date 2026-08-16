import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../src/renderer/src/components/Sidebar/Sidebar'

const projectApiMocks = {
  listProjects: vi.fn(),
  selectProjectDirectory: vi.fn(),
  createProject: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  projectApiMocks.listProjects.mockReturnValue(new Promise(() => undefined))
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: projectApiMocks
  })
})

describe('Sidebar', () => {
  it('renders the focused production workflow without smart edit', () => {
    render(<Sidebar activeItem="home" onItemSelect={vi.fn()} />)

    const navigation = screen.getByRole('navigation', { name: '主菜单' })
    expect(
      within(navigation)
        .getAllByRole('button')
        .filter((button) => button.classList.contains('studio-sidebar__menu-item'))
        .map((button) => button.textContent)
    ).toEqual(['新任务', '插件', '小说推文', 'TTS 配音', '素材库'])
    expect(within(navigation).getByLabelText('剪辑 Agent')).toBeInTheDocument()
    expect(within(navigation).getByRole('heading', { name: '制作工具' })).toBeInTheDocument()
    expect(within(navigation).getByRole('heading', { name: '对话' })).toBeInTheDocument()
    expect(within(navigation).getByRole('heading', { name: '项目' })).toBeInTheDocument()
    expect(
      within(navigation)
        .getAllByRole('heading')
        .map((heading) => heading.textContent)
    ).toEqual(['制作工具', '项目', '对话'])
    expect(within(navigation).getByText('暂无对话')).toBeInTheDocument()
    expect(within(navigation).getByText('暂无项目')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '智剪' })).not.toBeInTheDocument()
  })

  it('reports menu and settings selections', async () => {
    const user = userEvent.setup()
    const onItemSelect = vi.fn()
    const onSettingsSelect = vi.fn()
    render(
      <Sidebar activeItem="home" onItemSelect={onItemSelect} onSettingsSelect={onSettingsSelect} />
    )

    await user.click(screen.getByRole('button', { name: '小说推文' }))
    await user.click(screen.getByRole('button', { name: '插件' }))
    await user.click(screen.getByRole('button', { name: '新任务' }))
    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(onItemSelect).toHaveBeenNthCalledWith(1, 'novel-promotion')
    expect(onItemSelect).toHaveBeenNthCalledWith(2, 'plugins')
    expect(onItemSelect).toHaveBeenNthCalledWith(3, 'home')
    expect(onSettingsSelect).toHaveBeenCalledOnce()
  })

  it('opens project and conversation controls', async () => {
    const user = userEvent.setup()
    const onItemSelect = vi.fn()
    render(<Sidebar activeItem="home" onItemSelect={onItemSelect} />)

    await user.click(screen.getByRole('button', { name: '项目选项' }))
    const projectMenu = screen.getByRole('menu', { name: '项目排序方式设置' })
    expect(projectMenu).toBeInTheDocument()
    expect(within(projectMenu).getByRole('menuitemradio', { name: '按项目' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await user.click(screen.getByRole('menuitemradio', { name: '名称' }))

    await user.click(screen.getByRole('button', { name: '对话选项' }))
    const conversationMenu = screen.getByRole('menu', { name: '对话排序方式设置' })
    expect(conversationMenu).toBeInTheDocument()
    await user.click(within(conversationMenu).getByRole('menuitemradio', { name: '在一个列表中' }))

    await user.click(screen.getByRole('button', { name: '项目选项' }))
    expect(screen.getByRole('menuitemradio', { name: '在一个列表中' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await user.click(screen.getByRole('menuitemradio', { name: '最近更新' }))

    await user.click(screen.getByRole('button', { name: '对话选项' }))
    await user.click(screen.getByRole('menuitemradio', { name: '最近更新' }))

    await user.click(screen.getByRole('button', { name: '新建对话' }))
    expect(onItemSelect).toHaveBeenCalledWith('home')
  })

  it('loads projects persisted by Main when the sidebar mounts', async () => {
    projectApiMocks.listProjects.mockResolvedValueOnce({
      success: true,
      message: '已加载 1 个项目',
      projects: [
        {
          id: 'project-1',
          name: '已保存项目',
          rootDirectory: 'D:\\projects\\saved',
          createdAt: '2026-08-16T09:00:00.000Z',
          updatedAt: '2026-08-16T09:00:00.000Z'
        }
      ]
    })

    render(<Sidebar activeItem="home" onItemSelect={vi.fn()} />)

    expect(await screen.findByRole('button', { name: '已保存项目' })).toHaveAttribute(
      'title',
      'D:\\projects\\saved'
    )
  })

  it('creates a persistent project through the native directory flow', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      name: '测试项目',
      rootDirectory: 'D:\\projects\\test',
      createdAt: '2026-08-16T09:00:00.000Z',
      updatedAt: '2026-08-16T09:00:00.000Z'
    }
    projectApiMocks.selectProjectDirectory.mockResolvedValueOnce({
      success: true,
      message: '已选择项目文件夹',
      canceled: false,
      directoryPath: project.rootDirectory,
      directoryName: 'test'
    })
    projectApiMocks.createProject.mockResolvedValueOnce({
      success: true,
      message: '项目已创建并保存到本地',
      project,
      projects: [project]
    })
    render(<Sidebar activeItem="home" onItemSelect={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '项目选项' }))
    await user.click(screen.getByRole('button', { name: '新建项目' }))
    expect(screen.queryByRole('menu', { name: '项目排序方式设置' })).not.toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: '创建项目' })
    await user.type(within(dialog).getByRole('textbox', { name: '项目名称' }), '测试项目')
    await user.click(within(dialog).getByRole('button', { name: '选择项目文件夹' }))
    expect(within(dialog).getByRole('button', { name: 'test' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '创建项目' }))

    expect(projectApiMocks.createProject).toHaveBeenCalledWith({
      name: '测试项目',
      rootDirectory: 'D:\\projects\\test'
    })
    expect(await screen.findByRole('button', { name: '测试项目' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '创建项目' })).not.toBeInTheDocument()
  })
})

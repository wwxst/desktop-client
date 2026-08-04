import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import WorkspaceView from '../src/renderer/src/components/Workspace/WorkspaceView'

describe('WorkspaceView', () => {
  it('opens smart edit, creates a draft, and returns to the draft list', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: '智剪' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    expect(screen.getByRole('region', { name: '智剪编辑器' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回草稿' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()
  })

  it('resets an editor session after selecting another menu', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '智剪' }))
    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    await user.click(screen.getByRole('button', { name: '小说推文' }))
    expect(screen.getByRole('button', { name: '小说推文' })).toHaveAttribute(
      'aria-current',
      'page'
    )

    await user.click(screen.getByRole('button', { name: '智剪' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '智剪编辑器' })).not.toBeInTheDocument()
  })

  it('opens the TTS voiceover page from the sidebar', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: 'TTS 配音' }))

    expect(screen.getByRole('region', { name: 'TTS 配音' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '文本转换' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '配音文案' })).toBeInTheDocument()
    const preview = screen.getByRole('complementary', { name: '试听预览' })
    expect(within(preview).getByRole('combobox', { name: '文本语言' })).toHaveValue('zh-CN')
    expect(
      within(preview).getByRole('radiogroup', { name: '选择音色' })
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^1\./ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^2\./ })).not.toBeChecked()
    expect(screen.getAllByRole('img', { name: /音色头像/ })).toHaveLength(3)

    await user.click(screen.getByRole('radio', { name: /^2\./ }))
    expect(screen.getByRole('radio', { name: /^2\./ })).toBeChecked()
    expect(within(preview).queryByRole('combobox', { name: '语速' })).not.toBeInTheDocument()
    await user.click(within(preview).getByRole('button', { name: '高级设置' }))
    expect(within(preview).getByRole('region', { name: '高级设置' })).toBeInTheDocument()
    expect(within(preview).getByRole('combobox', { name: '语速' })).toBeInTheDocument()
    expect(within(preview).getByRole('button', { name: '开始转换' })).toBeDisabled()
  })
})

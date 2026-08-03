import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/renderer/src/App'

describe('App', () => {
  it('enters the workspace without credentials in development', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: '账号登录' })).toBeInTheDocument()
    expect(screen.getByText('文件')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByRole('navigation', { name: '主菜单' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '账号登录' })).not.toBeInTheDocument()
  })
})

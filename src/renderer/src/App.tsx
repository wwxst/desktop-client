import {
  useEffect,
  useState,
  type JSX,
  type SubmitEvent
} from 'react'
import AiPanel from './components/AiPanel/AiPanel'
import Activation from './components/Activation/Activation'
import Sidebar from './components/Sidebar/Sidebar'
import WorkspaceView from './components/WorkspaceView/WorkspaceView'
import {
  workspaceMenuItems,
  type MenuKey
} from './components/shared/workspaceNavigation'
import Layout from './layouts/Layout'
import type { SubscriptionData } from '../../shared/auth'
import './App.css'

type AppView = 'login' | 'workspace' | 'activation'

function App(): JSX.Element {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [rememberPassword, setRememberPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // 登录表单的字段错误
  const [accountError, setAccountError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // 页面顶部轻提示
  const [toastMessage, setToastMessage] = useState('')

  // 当前显示的页面
  const [currentView, setCurrentView] = useState<AppView>('login')

  // 工作台三栏共享的当前菜单
  const [activeMenu, setActiveMenu] = useState<MenuKey>('workspace')

  // 当前登录账号
  const [loggedInUsername, setLoggedInUsername] = useState('')

  // 当前查询到的订阅信息
  const [subscription, setSubscription] =
    useState<SubscriptionData | null>(null)

  // 是否正在检查订阅权限
  const [isCheckingSubscription, setIsCheckingSubscription] =
    useState(false)

  /**
   * Toast 显示2.5秒后自动关闭。
   */
  useEffect(() => {
    if (!toastMessage) {
      return
    }

    const timer = window.setTimeout(() => {
      setToastMessage('')
    }, 2500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [toastMessage])

  /**
   * 提交登录。
   *
   * 登录成功后直接进入工作台，
   * 此时不查询订阅状态。
   */
  const handleLogin = async (
    event: SubmitEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()

    if (isLoading) {
      return
    }

    // 清空上一次提示
    setAccountError('')
    setPasswordError('')
    setToastMessage('')

    const username = account.trim()
    let hasError = false

    if (!username) {
      setAccountError('请输入账号')
      hasError = true
    }

    if (!password) {
      setPasswordError('请输入密码')
      hasError = true
    }

    if (hasError) {
      return
    }

    try {
      setIsLoading(true)

      const result = await window.api.login({
        username,
        password
      })

      if (!result.success) {
        setToastMessage(result.message)
        return
      }

      /*
       * 登录成功后直接进入工作台。
       * 不在登录阶段检查订阅。
       */
      setLoggedInUsername(username)
      setCurrentView('workspace')
      setToastMessage('登录成功')
    } catch (error) {
      console.error('登录失败：', error)
      setToastMessage('客户端登录失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * 用户点击需要订阅的功能时，
   * 再向后端查询订阅权限。
   */
  const handleCreateTask = async (): Promise<void> => {
    if (isCheckingSubscription) {
      return
    }

    try {
      setIsCheckingSubscription(true)
      setToastMessage('')

      const result = await window.api.getSubscription()

      /*
       * Token失效或没有登录。
       */
      if (!result.authenticated) {
        setToastMessage(result.message)
        setCurrentView('login')
        setPassword('')
        return
      }

      /*
       * 网络异常或后端查询失败。
       */
      if (!result.success || !result.subscription) {
        setToastMessage(result.message)
        return
      }

      setSubscription(result.subscription)

      /*
       * 有有效订阅，可以使用剪辑功能。
       */
      if (result.subscription.valid) {
        setToastMessage('使用权限验证通过')

        /*
         * 新建剪辑任务页面暂时还没开发。
         * 下一步在这里切换到 create-task 页面。
         */
        return
      }

      /*
       * 没有有效订阅，进入兑换页面。
       */
      setCurrentView('activation')
    } catch (error) {
      console.error('检查订阅失败：', error)
      setToastMessage('订阅状态检查失败，请稍后重试')
    } finally {
      setIsCheckingSubscription(false)
    }
  }

  /**
   * 从工作台主动进入兑换页面。
   *
   * 主动进入时不强制查询订阅，
   * 用户可以直接输入兑换码。
   */
  const handleOpenActivation = (): void => {
    setCurrentView('activation')
  }

  /**
   * 从兑换页面返回工作台。
   */
  const handleBackToWorkspace = (): void => {
    setCurrentView('workspace')
  }

  /**
   * 兑换功能暂未接入。
   */
  const handleRedeemNotReady = (): void => {
    setToastMessage('兑换接口下一步接入')
  }

  const handleForgotPassword = (): void => {
    window.alert('忘记密码功能正在开发中')
  }

  const handleRegister = (): void => {
    window.alert('注册功能正在开发中')
  }

  const handleContactAdmin = (): void => {
    window.alert('请联系管理员')
  }

  const currentMenu =
    workspaceMenuItems.find((item) => item.key === activeMenu) ??
    workspaceMenuItems[0]

  return (
    <>
      {/* 所有页面共用的顶部轻提示 */}
      {toastMessage && (
        <div
          className="toast-message"
          role="alert"
          aria-live="assertive"
        >
          <span className="toast-icon" aria-hidden="true">
            !
          </span>

          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==================== 登录页面 ==================== */}
      {currentView === 'login' && (
        <main className="login-page">
          <section className="login-container">
            <div className="brand-logo">AI</div>

            <header className="login-heading">
              <h1>账号登录</h1>
              <p>登录账号后进入自动剪辑工作台</p>
            </header>

            <form className="login-form" onSubmit={handleLogin}>
              {/* 账号输入框 */}
              <div className="form-group">
                <div
                  className={`form-field ${
                    accountError ? 'form-field--error' : ''
                  }`}
                >
                  <span className="field-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5.5 19c0-3.3 2.7-6 6-6h1c3.3 0 6 2.7 6 6" />
                    </svg>
                  </span>

                  <input
                    value={account}
                    onChange={(event) => {
                      setAccount(event.target.value)

                      if (accountError) {
                        setAccountError('')
                      }
                    }}
                    type="text"
                    placeholder="请输入账号"
                    autoComplete="username"
                    disabled={isLoading}
                  />
                </div>

                {accountError && (
                  <p className="field-error" role="alert">
                    {accountError}
                  </p>
                )}
              </div>

              {/* 密码输入框 */}
              <div className="form-group">
                <div
                  className={`form-field ${
                    passwordError ? 'form-field--error' : ''
                  }`}
                >
                  <span className="field-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <rect
                        x="5"
                        y="10"
                        width="14"
                        height="10"
                        rx="2"
                      />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>

                  <input
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)

                      if (passwordError) {
                        setPasswordError('')
                      }
                    }}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    disabled={isLoading}
                  />

                  <button
                    className="password-toggle"
                    type="button"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => {
                      setShowPassword((current) => !current)
                    }}
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 7.2A9.8 9.8 0 0 1 12 7c6 0 9.5 5 9.5 5a15 15 0 0 1-2.4 2.7" />
                        <path d="M6.1 6.1C3.8 7.6 2.5 12 2.5 12s3.5 5 9.5 5a9.7 9.7 0 0 0 3-.5" />
                      </svg>
                    )}
                  </button>
                </div>

                {passwordError && (
                  <p className="field-error" role="alert">
                    {passwordError}
                  </p>
                )}
              </div>

              {/* 记住密码和忘记密码 */}
              <div className="login-options">
                <label className="remember-option">
                  <input
                    checked={rememberPassword}
                    onChange={(event) => {
                      setRememberPassword(event.target.checked)
                    }}
                    type="checkbox"
                    disabled={isLoading}
                  />

                  <span>记住密码</span>
                </label>

                <button
                  className="text-link"
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                >
                  忘记密码？
                </button>
              </div>

              {/* 登录按钮 */}
              <button
                className="login-button"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? '正在登录...' : '登录'}
              </button>
            </form>

            <div className="register-row">
              <span>还没有账号？</span>

              <button
                type="button"
                onClick={handleRegister}
                disabled={isLoading}
              >
                立即注册
              </button>
            </div>

            <button
              className="contact-button"
              type="button"
              onClick={handleContactAdmin}
              disabled={isLoading}
            >
              联系管理员
            </button>
          </section>

          <footer className="login-footer">
            <span>自动剪辑</span>
            <span>V1.0.0</span>
          </footer>
        </main>
      )}

      {/* ==================== 工作台页面 ==================== */}
      {currentView === 'workspace' && (
        <Layout
          sidebar={
            <Sidebar
              username={loggedInUsername}
              activeMenu={activeMenu}
              onMenuChange={setActiveMenu}
              onOpenActivation={handleOpenActivation}
            />
          }
          content={
            <WorkspaceView
              currentMenu={currentMenu}
              isCheckingSubscription={isCheckingSubscription}
              onCreateTask={handleCreateTask}
            />
          }
          aiPanel={<AiPanel currentMenu={currentMenu} />}
        />
      )}

      {/* ==================== 兑换页面 ==================== */}
      {currentView === 'activation' && (
        <Activation
          subscription={subscription}
          onBack={handleBackToWorkspace}
          onRedeemNotReady={handleRedeemNotReady}
        />
      )}
    </>
  )
}

export default App

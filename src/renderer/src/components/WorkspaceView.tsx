interface WorkspaceViewProps {
  username: string
  isCheckingSubscription: boolean
  onCreateTask: () => void
  onOpenActivation: () => void
}

function WorkspaceView({
  username,
  isCheckingSubscription,
  onCreateTask,
  onOpenActivation
}: WorkspaceViewProps) {
  return (
    <div className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <span className="workspace-brand__logo">K</span>

          <div>
            <strong>卡司自动剪辑</strong>
            <p>KASI DESKTOP</p>
          </div>
        </div>

        <nav className="workspace-nav">
          <button className="workspace-nav__item workspace-nav__item--active">
            <span>⌂</span>
            工作台
          </button>

          <button
            className="workspace-nav__item"
            type="button"
            onClick={onCreateTask}
          >
            <span>✂</span>
            剪辑任务
          </button>

          <button className="workspace-nav__item" type="button">
            <span>▤</span>
            任务记录
          </button>

          <button
            className="workspace-nav__item"
            type="button"
            onClick={onOpenActivation}
          >
            <span>◇</span>
            兑换中心
          </button>

          <button className="workspace-nav__item" type="button">
            <span>⚙</span>
            软件设置
          </button>
        </nav>

        <div className="workspace-sidebar__footer">
          <span>V1.0.0</span>
          <span>www.kasi730.com</span>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header">
          <div>
            <h1>工作台</h1>
            <p>管理剪辑任务和本地处理流程</p>
          </div>

          <div className="workspace-user">
            <div className="workspace-user__avatar">
              {username.slice(0, 1).toUpperCase()}
            </div>

            <div>
              <strong>{username}</strong>
              <span>当前登录账号</span>
            </div>
          </div>
        </header>

        <section className="workspace-welcome">
          <div>
            <span className="workspace-welcome__label">KASI EDITOR</span>
            <h2>开始创建新的剪辑任务</h2>
            <p>
              选择本地素材并创建自动剪辑任务。正式启动任务前，
              客户端会自动检查当前账号的订阅权限。
            </p>

            <button
              className="workspace-primary-button"
              type="button"
              disabled={isCheckingSubscription}
              onClick={onCreateTask}
            >
              {isCheckingSubscription
                ? '正在验证使用权限...'
                : '新建剪辑任务'}
            </button>
          </div>

          <div className="workspace-welcome__graphic">
            <span>▶</span>
          </div>
        </section>

        <section className="workspace-card-grid">
          <article className="workspace-card">
            <span className="workspace-card__icon">✂</span>
            <div>
              <h3>剪辑任务</h3>
              <p>创建和管理本地自动剪辑任务</p>
            </div>
            <button type="button" onClick={onCreateTask}>
              开始使用
            </button>
          </article>

          <article className="workspace-card">
            <span className="workspace-card__icon">◇</span>
            <div>
              <h3>订阅与兑换</h3>
              <p>查看授权状态或输入兑换码</p>
            </div>
            <button type="button" onClick={onOpenActivation}>
              前往兑换
            </button>
          </article>

          <article className="workspace-card">
            <span className="workspace-card__icon">▤</span>
            <div>
              <h3>最近任务</h3>
              <p>暂时还没有本地剪辑记录</p>
            </div>
            <button type="button">查看记录</button>
          </article>
        </section>
      </main>
    </div>
  )
}

export default WorkspaceView
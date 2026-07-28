import { useState, type FormEvent } from 'react'
import type { SubscriptionData } from '../../../shared/auth'

interface ActivationViewProps {
  subscription: SubscriptionData | null
  onBack: () => void
  onRedeemNotReady: () => void
}

function ActivationView({
  subscription,
  onBack,
  onRedeemNotReady
}: ActivationViewProps) {
  const [redeemCode, setRedeemCode] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!redeemCode.trim()) {
      return
    }

    /*
     * 下一步接入真实兑换接口。
     */
    onRedeemNotReady()
  }

  return (
    <main className="activation-page">
      <button
        className="activation-back"
        type="button"
        onClick={onBack}
      >
        ← 返回工作台
      </button>

      <section className="activation-card">
        <div className="activation-logo">K</div>

        <header>
          <h1>开通使用权限</h1>
          <p>
            当前账号暂时没有有效订阅，输入兑换码后即可开通或延长使用时间。
          </p>
        </header>

        <div className="activation-status">
          <span>当前状态</span>
          <strong>
            {subscription?.accessStatusDescription || '暂未开通'}
          </strong>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="redeemCode">兑换码</label>

          <input
            id="redeemCode"
            value={redeemCode}
            onChange={(event) => setRedeemCode(event.target.value)}
            type="text"
            placeholder="请输入KASI开头的兑换码"
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={!redeemCode.trim()}
          >
            立即兑换
          </button>
        </form>

        <p className="activation-tip">
          兑换成功后，客户端会重新检查当前订阅状态。
        </p>
      </section>
    </main>
  )
}

export default ActivationView
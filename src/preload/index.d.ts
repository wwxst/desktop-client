import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  LoginRequest,
  LoginResponse,
  SubscriptionCheckResponse,
} from '../shared/auth'

interface DesktopApi {
  /**
   * 用户登录。
   */
  login(loginRequest: LoginRequest): Promise<LoginResponse>

  /**
   * 查询当前用户订阅。
   */
  getSubscription(): Promise<SubscriptionCheckResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopApi
  }
}
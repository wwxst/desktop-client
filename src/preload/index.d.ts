import type { ElectronAPI } from '@electron-toolkit/preload'
import type { LoginRequest, LoginResponse } from '../shared/auth'

interface DesktopApi {
  /**
   * 调用普通用户登录接口。
   */
  login(loginRequest: LoginRequest): Promise<LoginResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopApi
  }
}
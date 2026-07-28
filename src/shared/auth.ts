/**
 * 登录请求参数。
 *
 * 字段名称必须与Java后端的UserLoginDTO一致。
 */
export interface LoginRequest {
  username: string
  password: string
}

/**
 * Java后端统一响应结构。
 */
export interface ApiResult<T> {
  code: number
  msg: string | null
  data: T | null
}

/**
 * Java后端登录成功后返回的数据。
 */
export interface LoginData {
  token: string
}

/**
 * Electron主进程返回给React页面的结果。
 *
 * Token不会传给React页面，
 * 只保存在Electron主进程内存中。
 */
export interface LoginResponse {
  success: boolean
  message: string
}

/**
 * 当前用户的订阅信息。
 *
 * 字段与Java后端的UserSubscriptionVO对应。
 */
export interface SubscriptionData {
  productId: number | null
  productCode: string | null
  productName: string | null
  accessStatus: string
  accessStatusDescription: string
  valid: boolean
  startedAt: string | null
  expiresAt: string | null
  serverTime: string
  remainingSeconds: number
}

/**
 * Electron主进程返回给React页面的订阅查询结果。
 */
export interface SubscriptionCheckResponse {
  success: boolean
  authenticated: boolean
  message: string
  subscription: SubscriptionData | null
}
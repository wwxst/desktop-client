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
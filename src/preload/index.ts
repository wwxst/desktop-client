import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { LoginRequest, LoginResponse } from '../shared/auth'

/**
 * 只向React页面开放允许使用的功能。
 *
 * 不直接暴露完整的ipcRenderer，
 * 避免React页面随意调用主进程能力。
 */
const api = {
  login: (loginRequest: LoginRequest): Promise<LoginResponse> => {
    return ipcRenderer.invoke('auth:login', loginRequest)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('注册preload接口失败：', error)
  }
} else {
  // @ts-ignore 仅用于关闭contextIsolation时兼容模板
  window.electron = electronAPI

  // @ts-ignore 仅用于关闭contextIsolation时兼容模板
  window.api = api
}
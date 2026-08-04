import { app, shell, BrowserWindow, ipcMain, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerTtsIpc } from './tts/registerTtsIpc'

import type {
  ApiResult,
  LoginData,
  LoginRequest,
  LoginResponse,
  SubscriptionCheckResponse,
  SubscriptionData
} from '../shared/auth'

/**
 * Java后端地址。
 *
 * 当前开发环境使用本机8080端口。
 * 后面部署服务器时，再改成正式接口地址。
 */
const API_BASE_URL = 'http://localhost:8080'

/**
 * 当前客户端的登录会话。
 *
 * Token只保存在Electron主进程中，
 * 不直接暴露给React页面。
 */
const authSession: {
  accessToken: string | null
} = {
  accessToken: null
}

/**
 * 注册用户登录IPC接口。
 */
function registerAuthIpc(): void {
  ipcMain.handle(
    'auth:login',
    async (_event, loginRequest: LoginRequest): Promise<LoginResponse> => {
      const username = loginRequest.username.trim()
      const password = loginRequest.password

      if (!username) {
        return {
          success: false,
          message: '请输入账号'
        }
      }

      if (!password) {
        return {
          success: false,
          message: '请输入密码'
        }
      }

      try {
        const response = await net.fetch(`${API_BASE_URL}/api/user/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username,
            password
          })
        })

        const result = (await response.json()) as ApiResult<LoginData>

        if (!response.ok || !result.data?.token) {
          return {
            success: false,
            message: result.msg || '账号或密码错误'
          }
        }

        authSession.accessToken = result.data.token

        return {
          success: true,
          message: '登录成功'
        }
      } catch (error) {
        console.error('调用用户登录接口失败：', error)

        return {
          success: false,
          message: '无法连接服务器，请确认Java后端已经启动'
        }
      }
    }
  )
}

/**
 * 注册订阅查询IPC接口。
 *
 * React页面不会直接拿到Token，
 * 由Electron主进程携带Token请求Java后端。
 */
function registerSubscriptionIpc(): void {
  ipcMain.handle(
    'subscription:get-current',
    async (): Promise<SubscriptionCheckResponse> => {
      const token = authSession.accessToken

      if (!token) {
        return {
          success: false,
          authenticated: false,
          message: '登录状态已失效，请重新登录',
          subscription: null
        }
      }

      try {
        const response = await net.fetch(
          `${API_BASE_URL}/api/user/subscription`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        const result =
          (await response.json()) as ApiResult<SubscriptionData>

        /*
         * Token失效时，清空主进程中的登录会话。
         */
        if (response.status === 401) {
          authSession.accessToken = null

          return {
            success: false,
            authenticated: false,
            message: result.msg || '登录状态已失效，请重新登录',
            subscription: null
          }
        }

        if (!response.ok || !result.data) {
          return {
            success: false,
            authenticated: true,
            message: result.msg || '订阅状态查询失败',
            subscription: null
          }
        }

        return {
          success: true,
          authenticated: true,
          message: '订阅状态查询成功',
          subscription: result.data
        }
      } catch (error) {
        console.error('查询用户订阅失败：', error)

        return {
          success: false,
          authenticated: true,
          message: '无法连接服务器，请稍后重试',
          subscription: null
        }
      }
    }
  )
}

function createWindow(): void {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 1000,
    minHeight: 680,
    title: '自动剪辑',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#e8e8e8',
      symbolColor: '#1f1f1f',
      height: 32
    },
    backgroundColor: '#f3f3f3',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),

    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 基于 electron-vite cli 的渲染器热更新
  // 开发环境加载远程URL，生产环境加载本地html文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 当Electron完成初始化并准备好创建浏览器窗口时调用此方法
// 初始化完成后，Electron会初始化并准备创建浏览器窗口。
// 某些API只能在此事件发生后使用
app.whenReady().then(() => {
  // 设置Windows 10+ 系统的应用用户模型ID
  electronApp.setAppUserModelId('com.electron')

  // 开发环境下，按 F12 打开或关闭 DevTools
  // 生产环境下，忽略 CommandOrControl + R  // https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC 测试接口
  ipcMain.on('ping', () => console.log('pong'))

  registerAuthIpc()
  registerSubscriptionIpc()
  registerTtsIpc()

  createWindow()

  app.on('activate', function () {
    // 在macOS上，当点击dock图标且没有其他窗口打开时
    // 通常会在应用中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 当所有窗口关闭时退出，但macOS除外...
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在此文件中，您可以包含应用的其他特定主进程代码...

import { app, shell, BrowserWindow, ipcMain, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import type {
  ApiResult,
  LoginData,
  LoginRequest,
  LoginResponse
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
function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 1000,
    minHeight: 680,
    title: '自动剪辑',
    backgroundColor: '#ffffff',
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  registerAuthIpc()
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

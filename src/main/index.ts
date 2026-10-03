import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

const MAX_FILE_SIZE = 5 * 1024 * 1024

let mainWindow: BrowserWindow | null = null
let openRequest = 0

async function openClipboardPath(win: BrowserWindow): Promise<void> {
  const request = ++openRequest
  const text = clipboard.readText().trim()
  if (!text || !path.isAbsolute(text)) return

  let stat: { isFile(): boolean; size: number }
  try {
    stat = await fs.stat(text)
  } catch {
    if (request === openRequest) {
      win.webContents.send('file:open-error', { filePath: text, message: 'File not found' })
    }
    return
  }
  if (!stat.isFile() || request !== openRequest) return
  if (stat.size > MAX_FILE_SIZE) {
    win.webContents.send('file:open-error', { filePath: text, message: 'File too large to preview' })
    return
  }

  try {
    const content = await fs.readFile(text, 'utf8')
    if (request !== openRequest) return
    if (content.includes('\0')) {
      win.webContents.send('file:open-error', { filePath: text, message: 'Binary file, cannot preview' })
      return
    }
    win.webContents.send('file:open', {
      filePath: text,
      fileName: path.basename(text),
      content
    })
  } catch {
    if (request === openRequest) {
      win.webContents.send('file:open-error', { filePath: text, message: 'Could not read file' })
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    backgroundColor: '#1e1e1e',
    darkTheme: true,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false)
  })
  mainWindow.on('focus', () => {
    if (mainWindow) void openClipboardPath(mainWindow)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowControls(): void {
  ipcMain.on('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })
  ipcMain.on('window:toggle-maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })
  ipcMain.handle('window:is-maximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sourceviewer.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWindowControls()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

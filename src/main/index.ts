import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import {
  collectRoots,
  expandUser,
  normalizeClipboard,
  resolveAgainstRoots,
  resolveInDir
} from './resolve'
import { FocusWatcher } from './focus'

const MAX_FILE_SIZE = 5 * 1024 * 1024

let mainWindow: BrowserWindow | null = null
let openRequest = 0
const focusWatcher = new FocusWatcher()

async function sendFile(win: BrowserWindow, filePath: string, request: number): Promise<boolean> {
  let stat: { isFile(): boolean; size: number }
  try {
    stat = await fs.stat(filePath)
  } catch {
    if (request === openRequest) {
      win.webContents.send('file:open-error', { filePath, message: 'File not found' })
    }
    return false
  }
  if (!stat.isFile() || request !== openRequest) return false
  if (stat.size > MAX_FILE_SIZE) {
    win.webContents.send('file:open-error', { filePath, message: 'File too large to preview' })
    return false
  }

  try {
    const content = await fs.readFile(filePath, 'utf8')
    if (request !== openRequest) return false
    if (content.includes('\0')) {
      win.webContents.send('file:open-error', { filePath, message: 'Binary file, cannot preview' })
      return false
    }
    win.webContents.send('file:open', {
      filePath,
      fileName: path.basename(filePath),
      content
    })
    return true
  } catch {
    if (request === openRequest) {
      win.webContents.send('file:open-error', { filePath, message: 'Could not read file' })
    }
    return false
  }
}

async function openClipboardPath(win: BrowserWindow): Promise<void> {
  const request = ++openRequest
  const norm = normalizeClipboard(clipboard.readText())
  if (!norm) return

  // As-typed first, :line-stripped second (a real `foo:12` file wins).
  const candidates = norm.raw === norm.stripped ? [norm.raw] : [norm.raw, norm.stripped]

  if (norm.kind === 'absolute') {
    for (const cand of candidates) {
      if (await sendFile(win, expandUser(cand), request)) return
    }
    if (request === openRequest) {
      win.webContents.send('file:open-error', { filePath: norm.raw, message: 'File not found' })
    }
    return
  }

  // Tier 0: the focused terminal's foreground agent cwd. Single root —
  // hit opens immediately, miss falls through (existence is always checked,
  // so a stale reading can never open the wrong file).
  if (norm.kind === 'relative') {
    const focus = focusWatcher.getLast()
    if (focus) {
      for (const cand of candidates) {
        const hit = await resolveInDir(focus.cwd, expandUser(cand))
        if (request !== openRequest) return
        if (hit) {
          await sendFile(win, hit, request)
          return
        }
      }
    }
  }

  // One tier: every live agent root is consulted; a single match opens,
  // several show the picker.
  const roots = await collectRoots()
  if (request !== openRequest) return
  for (const cand of candidates) {
    const matches = await resolveAgainstRoots(roots, expandUser(cand))
    if (request !== openRequest) return
    if (matches.length === 1) {
      await sendFile(win, matches[0], request)
      return
    }
    if (matches.length > 1) {
      win.webContents.send('file:candidates', { query: norm.raw, paths: matches })
      return
    }
  }
  if (request === openRequest) {
    win.webContents.send('file:open-error', {
      filePath: norm.raw,
      message: `No match in ${roots.length} known folders`
    })
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
  ipcMain.on('file:open-path', (event, filePath: unknown) => {
    if (typeof filePath !== 'string') return
    const norm = normalizeClipboard(filePath)
    if (!norm || norm.kind !== 'absolute') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) void sendFile(win, expandUser(norm.raw), ++openRequest)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sourceviewer.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWindowControls()
  focusWatcher.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

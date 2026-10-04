import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { execFile, spawn } from 'child_process'
import { join } from 'path'
import { promises as fs } from 'fs'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import {
  collectRoots,
  expandUser,
  normalizeClipboard,
  resolveAgainstRoots,
  resolveInDir,
  resolvePublishedFallback
} from './resolve'
import { FocusWatcher } from './focus'
import { getFileDiff } from './git'
import { shouldHandle, shouldResendPicker } from './clipwatch'

const MAX_FILE_SIZE = 5 * 1024 * 1024

let mainWindow: BrowserWindow | null = null
let openRequest = 0
const focusWatcher = new FocusWatcher()
let dedupeState: { raw: string; at: number } | null = null
let pickerSquelch: { query: string; until: number } | null = null
/**
 * Last text copied *from inside the app* (title bar / gutter click-drag).
 * The focus watcher opens whatever is in the clipboard, so without this an
 * in-app copy would reopen the current file on next focus — and worse,
 * `consumeClipboard()` would wipe the text the user just copied.
 */
let lastInternalCopy: string | null = null

async function sendFile(
  win: BrowserWindow,
  filePath: string,
  request: number,
  selection: { start: number; end: number } | null
): Promise<boolean> {
  let stat: { isFile(): boolean; size: number }
  try {
    stat = await fs.stat(filePath)
  } catch {
    // TypeScript sources often don't ship in node_modules — try the
    // published compiled counterpart before reporting it missing.
    const alt = await resolvePublishedFallback(filePath)
    if (alt && request === openRequest) return sendFile(win, alt, request, selection)
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
    // Content and diff are independent — fetch concurrently.
    const [content, git] = await Promise.all([
      fs.readFile(filePath, 'utf8'),
      request === openRequest ? getFileDiff(filePath) : Promise.resolve(null)
    ])
    if (request !== openRequest) return false
    if (content.includes('\0')) {
      win.webContents.send('file:open-error', { filePath, message: 'Binary file, cannot preview' })
      return false
    }
    win.webContents.send('file:open', {
      filePath,
      fileName: path.basename(filePath),
      content,
      diff: git?.diff ?? null,
      head: git?.head ?? null,
      selection
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
  const opened = await handleClipboardText(win, clipboard.readText())
  if (opened) consumeClipboard()
}

/** Clear the clipboard so a consumed path can't retrigger. Never throws. */
function consumeClipboard(): void {
  try {
    clipboard.clear()
  } catch {
    // A stuck clipboard just means a possible duplicate open later.
  }
  if (process.platform === 'linux') {
    // Electron clipboard writes are black-holed on native Wayland
    // (verified: neither clear() nor writeText() reaches the compositor),
    // while `wl-copy --clear` genuinely clears. Best-effort fallback.
    try {
      execFile('wl-copy', ['--clear'], { timeout: 2000 }, () => {})
    } catch {
      // No wl-copy present — clipboard.clear() above is the fallback.
    }
  }
}

/**
 * Resolve clipboard text to a file and open it. Returns true when a file
 * was opened (caller clears the clipboard so it can't retrigger).
 */
async function handleClipboardText(win: BrowserWindow, raw: string): Promise<boolean> {
  // Text we copied ourselves must never trigger an open: the file is already
  // on screen, and handling it would consume (clear) the user's just-copied
  // text. A different clipboard means ours was overwritten — drop the guard.
  if (lastInternalCopy !== null) {
    if (raw === lastInternalCopy) return false
    lastInternalCopy = null
  }
  const decision = shouldHandle(raw, dedupeState, Date.now())
  dedupeState = decision.state
  if (!decision.handle) return false

  try {
    return await resolveAndOpen(win, raw)
  } catch {
    // Never fail silently: an unexpected error must surface in the UI,
    // otherwise the clipboard poisons and identical recopies stay mute.
    if (!win.isDestroyed()) {
      try {
        win.webContents.send('file:open-error', {
          filePath: raw.slice(0, 200),
          message: 'Could not open clipboard path'
        })
      } catch {
        // Renderer gone — nothing left to tell.
      }
    }
    return false
  }
}

async function resolveAndOpen(win: BrowserWindow, raw: string): Promise<boolean> {
  const request = ++openRequest
  const norm = normalizeClipboard(raw)
  if (!norm) return false

  // As-typed first, :line-stripped second (a real `foo:12` file wins).
  const candidates = norm.raw === norm.stripped ? [norm.raw] : [norm.raw, norm.stripped]

  // Start the live-roots scan immediately so it overlaps tier 0 on a miss.
  // collectRoots never rejects; the promise is only awaited if needed.
  const rootsPromise = collectRoots()

  if (norm.kind === 'absolute') {
    for (const cand of candidates) {
      if (await sendFile(win, expandUser(cand), request, norm.selection)) return true
    }
    if (request === openRequest) {
      win.webContents.send('file:open-error', { filePath: norm.raw, message: 'File not found' })
    }
    return false
  }

  // Tier 0: the focused terminal's foreground agent cwd. Single root —
  // hit opens immediately, miss falls through (existence is always checked,
  // so a stale reading can never open the wrong file).
  if (norm.kind === 'relative') {
    const focus = focusWatcher.getLast()
    if (focus) {
      for (const cand of candidates) {
        const hit = await resolveInDir(focus.cwd, expandUser(cand))
        if (request !== openRequest) return false
        if (hit) {
          return await sendFile(win, hit, request, norm.selection)
        }
      }
    }
  }

  // One tier: every live agent root is consulted; a single match opens,
  // several show the picker.
  const roots = await rootsPromise
  if (request !== openRequest) return false
  for (const cand of candidates) {
    const matches = await resolveAgainstRoots(roots, expandUser(cand))
    if (request !== openRequest) return false
    if (matches.length === 1) {
      pickerSquelch = null
      return await sendFile(win, matches[0], request, norm.selection)
    }
    if (matches.length > 1) {
      const decision = shouldResendPicker(norm.raw, pickerSquelch, Date.now())
      pickerSquelch = decision.squelch
      if (decision.send) {
        win.webContents.send('file:candidates', { query: norm.raw, paths: matches })
        // Prompting consumes the query: no re-prompt on refocus, and the
        // squelch above stays armed for copies made before this clear lands.
        consumeClipboard()
      }
      return false
    }
  }
  if (request === openRequest) {
    win.webContents.send('file:open-error', {
      filePath: norm.raw,
      message: `No match in ${roots.length} known folders`
    })
  }
  return false
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
  ipcMain.handle('clipboard:write-text', (_, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0) return
    // Record before writing: this marks the clipboard as ours so the focus
    // watcher in handleClipboardText skips it instead of reopening it.
    lastInternalCopy = text
    try {
      clipboard.writeText(text)
    } catch {
      // Fall through to the wl-copy attempt below on Linux.
    }
    if (process.platform === 'linux') {
      // Electron clipboard writes are black-holed on native Wayland,
      // so mirror through wl-copy (best-effort).
      try {
        const child = spawn('wl-copy', [], { stdio: ['pipe', 'ignore', 'ignore'] })
        child.on('error', () => {})
        try {
          child.stdin?.write(text)
          child.stdin?.end()
        } catch {
          // Pipe broken — clipboard.writeText above is the fallback.
        }
      } catch {
        // No wl-copy present — clipboard.writeText above is the fallback.
      }
    }
  })
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
    if (win) {
      void sendFile(win, expandUser(norm.raw), ++openRequest, null).then((opened) => {
        if (opened) consumeClipboard()
      })
    }
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

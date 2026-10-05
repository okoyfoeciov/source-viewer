import { contextBridge, ipcRenderer } from 'electron'

export interface WindowControls {
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void
}

export interface OpenedFile {
  filePath: string
  fileName: string
  content: string
  diff: string | null
  head: string | null
  selection: { start: number; end: number } | null
  /** Delivery kind, classified by the main process (see src/main/filetype). */
  kind: 'text' | 'image' | 'pdf'
  /** MIME type for image/pdf, null for text. */
  mime: string | null
  /** Base64 data URL for image/pdf, null for text. */
  dataUrl: string | null
}

export interface FileOpenError {
  filePath: string
  message: string
}

export interface FileCandidates {
  query: string
  paths: string[]
  selection: { start: number; end: number } | null
}

export interface FilesApi {
  onFileOpen: (cb: (file: OpenedFile) => void) => () => void
  onFileError: (cb: (err: FileOpenError) => void) => () => void
  onCandidates: (cb: (c: FileCandidates) => void) => () => void
  openPath: (filePath: string, selection?: { start: number; end: number } | null) => void
}

export interface ElectronClipboard {
  writeText: (text: string) => Promise<void>
}

// Expose a minimal, read-only-safe API surface.
const api = {} as const

const windowControls: WindowControls = {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (cb) => {
    const listener = (_: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized-changed', listener)
    return () => ipcRenderer.removeListener('window:maximized-changed', listener)
  }
}

const files: FilesApi = {
  onFileOpen: (cb) => {
    const listener = (_: unknown, file: OpenedFile): void => cb(file)
    ipcRenderer.on('file:open', listener)
    return () => ipcRenderer.removeListener('file:open', listener)
  },
  onFileError: (cb) => {
    const listener = (_: unknown, err: FileOpenError): void => cb(err)
    ipcRenderer.on('file:open-error', listener)
    return () => ipcRenderer.removeListener('file:open-error', listener)
  },
  onCandidates: (cb) => {
    const listener = (_: unknown, c: FileCandidates): void => cb(c)
    ipcRenderer.on('file:candidates', listener)
    return () => ipcRenderer.removeListener('file:candidates', listener)
  },
  openPath: (filePath: string, selection?: { start: number; end: number } | null) =>
    ipcRenderer.send('file:open-path', filePath, selection ?? null)
}

const electronClipboard: ElectronClipboard = {
  writeText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text)
}

try {
  // Lets the renderer adapt per-OS (e.g. no inset border on macOS).
  contextBridge.exposeInMainWorld('platform', process.platform)
  contextBridge.exposeInMainWorld('api', api)
  contextBridge.exposeInMainWorld('windowControls', windowControls)
  contextBridge.exposeInMainWorld('files', files)
  contextBridge.exposeInMainWorld('electronClipboard', electronClipboard)
} catch {
  // Context bridge unavailable (shouldn't happen with contextIsolation on)
}

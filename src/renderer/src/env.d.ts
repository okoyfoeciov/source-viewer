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
}

export interface FileOpenError {
  filePath: string
  message: string
}

export interface FileCandidates {
  query: string
  paths: string[]
}

export interface FilesApi {
  onFileOpen: (cb: (file: OpenedFile) => void) => () => void
  onFileError: (cb: (err: FileOpenError) => void) => () => void
  onCandidates: (cb: (c: FileCandidates) => void) => () => void
  openPath: (filePath: string) => void
}

export interface ElectronClipboard {
  writeText: (text: string) => Promise<void>
}

declare global {
  interface Window {
    api: Record<string, never>
    windowControls: WindowControls
    files: FilesApi
    electronClipboard: ElectronClipboard
  }
}

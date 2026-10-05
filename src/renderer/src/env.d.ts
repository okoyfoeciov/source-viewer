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

declare global {
  interface Window {
    api: Record<string, never>
    platform: NodeJS.Platform
    windowControls: WindowControls
    files: FilesApi
    electronClipboard: ElectronClipboard
  }
}

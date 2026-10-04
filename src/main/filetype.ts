/**
 * File-kind classification by extension. Single source of truth — the main
 * process classifies and the renderer just switches on `kind`.
 *
 * - text: everything decoded as UTF-8 (code, markdown, csv/tsv/log, ...).
 *   Full features: highlighting, gutter line-ref copy, diff view.
 * - image/pdf: shown in dedicated viewers. No diff view (git reports binary
 *   anyway) and no line-ref copy — lines don't exist there. The title-bar
 *   path copy stays available for every kind.
 */
export type FileKind = 'text' | 'image' | 'pdf'

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  // SVG is XML text, but it renders — show it, don't diff it.
  svg: 'image/svg+xml'
}

export function classifyFile(fileName: string): { kind: FileKind; mime: string | null } {
  const dot = fileName.toLowerCase().lastIndexOf('.')
  const ext = dot === -1 ? '' : fileName.toLowerCase().slice(dot + 1)
  if (ext === 'pdf') return { kind: 'pdf', mime: 'application/pdf' }
  const mime = IMAGE_MIME[ext]
  if (mime) return { kind: 'image', mime }
  return { kind: 'text', mime: null }
}

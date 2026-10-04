import { useEffect, useMemo, useRef, useState } from 'react'
import CustomScroll from './CustomScroll'
import { buildFullFile, markersForLines, parseUnifiedDiff } from '../diff'
import type { FullLine } from '../diff'
import { detectLanguage, escapeHtml, highlightLines } from '../highlight'
import { copyText, formatLineRef } from '../copy'
import 'highlight.js/styles/vs2015.css'

interface DiffViewerProps {
  filePath: string
  fileName: string
  content: string
  /** HEAD version of the file; null when unavailable (then deletions render plain). */
  head: string | null
  diff: string
  selection: { start: number; end: number } | null
  onClearSelection: () => void
}

const MONO = "'SF Mono', Menlo, Consolas, monospace"

export default function DiffViewer({
  filePath,
  fileName,
  content,
  head,
  diff,
  selection,
  onClearSelection
}: DiffViewerProps): React.JSX.Element {
  const lang = detectLanguage(fileName)
  const newHtml = useMemo(() => highlightLines(content, lang), [content, lang])
  const oldHtml = useMemo(
    () => (head === null ? null : highlightLines(head, lang)),
    [head, lang]
  )
  const { lines, markers } = useMemo(() => {
    const ls = buildFullFile(content, parseUnifiedDiff(diff))
    return { lines: ls, markers: markersForLines(ls) }
  }, [content, diff])
  // Gutter width grows with the digit count so 5+ digit line numbers
  // never overflow into the left edge (3.5em CSS fallback + 12px left pad).
  const maxNo = lines.reduce((m, l) => Math.max(m, l.oldNo ?? 0, l.newNo ?? 0), 0)
  const gutterStyle = { width: `calc(${String(Math.max(maxNo, 1)).length}ch + 32px)` }

  const [anchor, setAnchor] = useState<number | null>(null)
  const [current, setCurrent] = useState<number | null>(null)
  const anchorRef = useRef<number | null>(null)
  const currentRef = useRef<number | null>(null)

  useEffect(() => {
    const onUp = (): void => {
      const a = anchorRef.current
      const c = currentRef.current
      if (a === null || c === null) return
      anchorRef.current = null
      currentRef.current = null
      setAnchor(null)
      setCurrent(null)
      const ref = formatLineRef(filePath, a, c)
      void copyText(ref)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [filePath])

  const htmlFor = (line: FullLine): string => {
    if (line.type === 'del') {
      if (line.oldNo !== null && oldHtml && oldHtml[line.oldNo - 1] !== undefined) {
        return oldHtml[line.oldNo - 1]
      }
      return escapeHtml(line.text)
    }
    if (line.newNo !== null && newHtml[line.newNo - 1] !== undefined) {
      return newHtml[line.newNo - 1]
    }
    return escapeHtml(line.text)
  }

  const inSelection = (line: FullLine): boolean =>
    selection !== null &&
    line.newNo !== null &&
    line.newNo >= selection.start &&
    line.newNo <= selection.end

  const inDrag = (line: FullLine): boolean => {
    if (anchor === null || current === null || line.newNo === null) return false
    const lo = Math.min(anchor, current)
    const hi = Math.max(anchor, current)
    return line.newNo >= lo && line.newNo <= hi
  }

  const onGutterDown =
    (newNo: number | null) =>
    (e: React.MouseEvent): void => {
      if (newNo === null) return
      e.stopPropagation()
      e.preventDefault()
      anchorRef.current = newNo
      currentRef.current = newNo
      setAnchor(newNo)
      setCurrent(newNo)
    }

  const onGutterEnter = (newNo: number | null): void => {
    if (anchorRef.current === null || newNo === null) return
    currentRef.current = newNo
    setCurrent(newNo)
  }

  return (
    <CustomScroll
      className="code-viewer"
      annotations={markers}
      revealLine={selection === null ? null : selection.start}
      onClick={onClearSelection}
    >
      <div className="diff" style={{ fontFamily: MONO }}>
        {lines.map((line, i) => (
          <div
            key={i}
            data-lno={line.newNo ?? undefined}
            className={
              inSelection(line) || inDrag(line)
                ? `diff-line diff-line-${line.type} diff-line-selected`
                : `diff-line diff-line-${line.type}`
            }
          >
            <span className="diff-gutter" style={gutterStyle}>
              {line.oldNo ?? ''}
            </span>
            <span
              className={
                line.newNo !== null
                  ? 'diff-gutter diff-gutter-copyable'
                  : 'diff-gutter'
              }
              style={gutterStyle}
              title={
                line.newNo !== null ? 'Click to copy line ref, drag for range' : undefined
              }
              onMouseDown={onGutterDown(line.newNo)}
              onMouseEnter={() => onGutterEnter(line.newNo)}
              onClick={(e) => e.stopPropagation()}
            >
              {line.newNo ?? ''}
            </span>
            <span className="diff-sign">
              {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
            </span>
            <code className="diff-code">
              <span dangerouslySetInnerHTML={{ __html: htmlFor(line) }} />
              {line.noNewline && <span className="diff-nonl"> ⏎ no newline</span>}
            </code>
          </div>
        ))}
      </div>
    </CustomScroll>
  )
}

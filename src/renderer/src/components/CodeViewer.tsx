import { useEffect, useMemo, useRef, useState } from 'react'
import CustomScroll from './CustomScroll'
import { detectLanguage, highlightLines } from '../highlight'
import { copyText, formatLineRef } from '../copy'
import 'highlight.js/styles/vs2015.css'

interface CodeViewerProps {
  filePath: string
  fileName: string
  content: string
  selection: { start: number; end: number } | null
  onClearSelection: () => void
}

const MONO = "'SF Mono', Menlo, Consolas, monospace"

export default function CodeViewer({
  filePath,
  fileName,
  content,
  selection,
  onClearSelection
}: CodeViewerProps): React.JSX.Element {
  const html = useMemo(
    () => highlightLines(content, detectLanguage(fileName)),
    [content, fileName]
  )
  const [anchor, setAnchor] = useState<number | null>(null)
  const [current, setCurrent] = useState<number | null>(null)
  const [copiedRef, setCopiedRef] = useState<string | null>(null)
  const anchorRef = useRef<number | null>(null)
  const currentRef = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    },
    []
  )

  const showToast = (text: string): void => {
    setCopiedRef(text)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setCopiedRef(null), 1500)
  }

  // Window mouseup completes a gutter drag (click or drag-select).
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
      void copyText(ref).then((ok) => {
        if (ok) showToast(ref)
      })
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [filePath])

  const inSelection = (n: number): boolean =>
    selection !== null && n >= selection.start && n <= selection.end

  const inDrag = (n: number): boolean => {
    if (anchor === null || current === null) return false
    const lo = Math.min(anchor, current)
    const hi = Math.max(anchor, current)
    return n >= lo && n <= hi
  }

  const onGutterDown = (n: number) => (e: React.MouseEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    anchorRef.current = n
    currentRef.current = n
    setAnchor(n)
    setCurrent(n)
  }

  const onGutterEnter = (n: number): void => {
    if (anchorRef.current === null) return
    currentRef.current = n
    setCurrent(n)
  }

  return (
    <CustomScroll
      className="code-viewer"
      revealLine={selection === null ? null : selection.start}
    >
      <div className="code" onClick={onClearSelection} style={{ fontFamily: MONO }}>
        {html.map((h, i) => {
          const n = i + 1
          const selected = inSelection(n) || inDrag(n)
          return (
            <div
              key={i}
              data-lno={n}
              className={selected ? 'code-row code-row-selected' : 'code-row'}
            >
              <span
                className="code-gutter code-gutter-copyable"
                title="Click to copy line ref, drag for range"
                onMouseDown={onGutterDown(n)}
                onMouseEnter={() => onGutterEnter(n)}
                onClick={(e) => e.stopPropagation()}
              >
                {n}
              </span>
              <code className="code-code">
                <span dangerouslySetInnerHTML={{ __html: h }} />
              </code>
            </div>
          )
        })}
      </div>
      {copiedRef && <div className="copy-toast">{copiedRef}</div>}
    </CustomScroll>
  )
}

import { useMemo } from 'react'
import CustomScroll from './CustomScroll'
import { buildFullFile, markersForLines, parseUnifiedDiff } from '../diff'
import type { FullLine } from '../diff'
import { detectLanguage, escapeHtml, highlightLines } from '../highlight'
import 'highlight.js/styles/vs2015.css'

interface DiffViewerProps {
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

  return (
    <CustomScroll
      className="code-viewer"
      annotations={markers}
      revealLine={selection === null ? null : selection.start}
    >
      <div className="diff" onClick={onClearSelection} style={{ fontFamily: MONO }}>
        {lines.map((line, i) => (
          <div
            key={i}
            data-lno={line.newNo ?? undefined}
            className={
              inSelection(line)
                ? `diff-line diff-line-${line.type} diff-line-selected`
                : `diff-line diff-line-${line.type}`
            }
          >
            <span className="diff-gutter">{line.oldNo ?? ''}</span>
            <span className="diff-gutter">{line.newNo ?? ''}</span>
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

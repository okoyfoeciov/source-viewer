import { useMemo } from 'react'
import CustomScroll from './CustomScroll'
import { detectLanguage, highlightLines } from '../highlight'
import 'highlight.js/styles/vs2015.css'

interface CodeViewerProps {
  fileName: string
  content: string
  selection: { start: number; end: number } | null
  onClearSelection: () => void
}

const MONO = "'SF Mono', Menlo, Consolas, monospace"

export default function CodeViewer({
  fileName,
  content,
  selection,
  onClearSelection
}: CodeViewerProps): React.JSX.Element {
  const html = useMemo(
    () => highlightLines(content, detectLanguage(fileName)),
    [content, fileName]
  )
  const inSelection = (n: number): boolean =>
    selection !== null && n >= selection.start && n <= selection.end

  return (
    <CustomScroll
      className="code-viewer"
      revealLine={selection === null ? null : selection.start}
    >
      <div className="code" onClick={onClearSelection} style={{ fontFamily: MONO }}>
        {html.map((h, i) => (
          <div
            key={i}
            data-lno={i + 1}
            className={inSelection(i + 1) ? 'code-row code-row-selected' : 'code-row'}
          >
            <span className="code-gutter">{i + 1}</span>
            <code className="code-code">
              <span dangerouslySetInnerHTML={{ __html: h }} />
            </code>
          </div>
        ))}
      </div>
    </CustomScroll>
  )
}

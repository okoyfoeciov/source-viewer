import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { FileCandidates } from '../env'

interface CandidatesPickerProps {
  candidates: FileCandidates
  onClose: () => void
}

/**
 * Longest common directory prefix, compared per segment so a cut never
 * lands mid-name and hides the distinct part.
 */
function commonDir(paths: string[]): string {
  if (paths.length === 0) return ''
  const segs = paths.map((p) => p.split('/'))
  const first = segs[0]
  let len = 0
  while (len < first.length && segs.every((s) => s[len] === first[len])) len++
  return first.slice(0, len).join('/')
}

export default function CandidatesPicker({
  candidates,
  onClose
}: CandidatesPickerProps): React.JSX.Element {
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [candidates])

  const open = (filePath: string): void =>
    window.files?.openPath(filePath, candidates.selection ?? null)

  // Rows show only the part that differs between matches. The title
  // already shows the shared query tail, so both the common root prefix
  // and the common tail are cut (e.g. `…/resilient-zooming-pelican` vs the
  // repo-root copy). Full paths stay on hover and are what Enter/click
  // actually opens.
  const base = commonDir(candidates.paths)
  const rels = candidates.paths.map((p) => {
    if (base && p.startsWith(base)) {
      const rest = p.slice(base.length).replace(/^\/+/, '')
      if (rest) return rest
    }
    return p
  })
  const segLists = rels.map((r) => r.split('/'))
  const minLen = Math.min(...segLists.map((s) => s.length))
  let tail = 0
  while (
    tail < minLen &&
    segLists.every((s) => s[s.length - 1 - tail] === segLists[0][segLists[0].length - 1 - tail])
  ) {
    tail++
  }
  // A match with no differing middle is the file directly under the
  // common root — label it with the root's own name.
  const rootName = base.split('/').filter(Boolean).pop() ?? ''
  const display = (i: number): string => {
    const segs = segLists[i].slice(0, segLists[i].length - tail)
    if (segs.length > 0) return segs.join('/')
    return rootName || candidates.paths[i]
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, candidates.paths.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      const pick = candidates.paths[selected]
      if (pick) open(pick)
    }
  }

  return (
    <div className="candidates" tabIndex={0} onKeyDown={onKeyDown} autoFocus>
      <div className="candidates-title">
        {candidates.paths.length} matches for <span className="candidates-query">{candidates.query}</span>
      </div>
      <div className="candidates-list">
        {candidates.paths.map((p, i) => (
          <button
            key={p}
            className={i === selected ? 'candidates-item candidates-item-active' : 'candidates-item'}
            title={p}
            onClick={() => open(p)}
            onMouseEnter={() => setSelected(i)}
          >
            {display(i)}
          </button>
        ))}
      </div>
      <div className="candidates-hint">↑↓ to move · Enter to open · Esc to dismiss</div>
    </div>
  )
}

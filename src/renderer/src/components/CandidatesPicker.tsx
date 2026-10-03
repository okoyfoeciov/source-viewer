import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { FileCandidates } from '../env'

interface CandidatesPickerProps {
  candidates: FileCandidates
  onClose: () => void
}

export default function CandidatesPicker({
  candidates,
  onClose
}: CandidatesPickerProps): React.JSX.Element {
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [candidates])

  const open = (filePath: string): void => window.files?.openPath(filePath)

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
            onClick={() => open(p)}
            onMouseEnter={() => setSelected(i)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="candidates-hint">↑↓ to move · Enter to open · Esc to dismiss</div>
    </div>
  )
}

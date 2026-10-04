import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import CodeViewer from './components/CodeViewer'
import DiffViewer from './components/DiffViewer'
import CandidatesPicker from './components/CandidatesPicker'
import type { FileCandidates, FileOpenError, OpenedFile } from './env'

export default function App(): React.JSX.Element {
  const [file, setFile] = useState<OpenedFile | null>(null)
  const [error, setError] = useState<FileOpenError | null>(null)
  const [candidates, setCandidates] = useState<FileCandidates | null>(null)

  useEffect(() => {
    const offOpen = window.files?.onFileOpen((f) => {
      setFile(f)
      setError(null)
      setCandidates(null)
    })
    const offError = window.files?.onFileError((e) => {
      // Don't clobber an already-open file with a clipboard error.
      setFile((current) => {
        if (!current) setError(e)
        return current
      })
    })
    const offCandidates = window.files?.onCandidates((c) => {
      setCandidates(c)
    })
    return () => {
      offOpen?.()
      offError?.()
      offCandidates?.()
    }
  }, [])

  const clearSelection = (): void => {
    setFile((current) =>
      current && current.selection ? { ...current, selection: null } : current
    )
  }

  return (
    <div className="app">
      <TitleBar filePath={file?.filePath ?? null} />
      <main className="content">
        {file ? (
          file.diff ? (
            <DiffViewer
              key={`diff:${file.filePath}`}
              filePath={file.filePath}
              fileName={file.fileName}
              content={file.content}
              head={file.head}
              diff={file.diff}
              selection={file.selection}
              onClearSelection={clearSelection}
            />
          ) : (
            <CodeViewer
              key={file.filePath}
              filePath={file.filePath}
              fileName={file.fileName}
              content={file.content}
              selection={file.selection}
              onClearSelection={clearSelection}
            />
          )
        ) : error ? (
          <div className="panel-message">
            <span className="panel-message-title">{error.message}</span>
            <span className="panel-message-path">{error.filePath}</span>
          </div>
        ) : (
          <div className="panel-message">
            <span className="panel-message-title">Nothing open</span>
            <span className="panel-message-path">
              Copy an absolute file path, then focus the app
            </span>
          </div>
        )}
        {candidates && (
          <CandidatesPicker candidates={candidates} onClose={() => setCandidates(null)} />
        )}
      </main>
    </div>
  )
}

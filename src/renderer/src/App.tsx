import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import CodeViewer from './components/CodeViewer'
import type { FileOpenError, OpenedFile } from './env'

export default function App(): React.JSX.Element {
  const [file, setFile] = useState<OpenedFile | null>(null)
  const [error, setError] = useState<FileOpenError | null>(null)

  useEffect(() => {
    const offOpen = window.files?.onFileOpen((f) => {
      setFile(f)
      setError(null)
    })
    const offError = window.files?.onFileError((e) => {
      // Don't clobber an already-open file with a clipboard error.
      setFile((current) => {
        if (!current) setError(e)
        return current
      })
    })
    return () => {
      offOpen?.()
      offError?.()
    }
  }, [])

  return (
    <div className="app">
      <TitleBar filePath={file?.filePath ?? null} />
      <main className="content">
        {file ? (
          <CodeViewer key={file.filePath} fileName={file.fileName} content={file.content} />
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
      </main>
    </div>
  )
}

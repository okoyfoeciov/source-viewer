import { useEffect, useState } from 'react'
import { copyText } from '../copy'

function MinimizeIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function MaximizeIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function RestoreIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M3.5 1.5h5v5M6.5 1.5h-5v5h5v-5z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M1.5 1.5l7 7M8.5 1.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface TitleBarProps {
  filePath: string | null
}

function splitPath(filePath: string): { dir: string; base: string } {
  const slash = filePath.lastIndexOf('/')
  if (slash === -1) return { dir: '', base: filePath }
  return { dir: filePath.slice(0, slash) || '/', base: filePath.slice(slash + 1) }
}

export default function TitleBar({ filePath }: TitleBarProps): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let dispose: (() => void) | undefined
    window.windowControls
      ?.isMaximized()
      .then(setMaximized)
      .catch(() => {})
    if (window.windowControls?.onMaximizedChange) {
      dispose = window.windowControls.onMaximizedChange(setMaximized)
    }
    return () => dispose?.()
  }, [])

  const toggle = (): void => window.windowControls?.toggleMaximize()
  const parts = filePath ? splitPath(filePath) : null

  const copyPath = async (): Promise<void> => {
    if (!filePath) return
    await copyText(filePath)
  }

  return (
    <header
      className="titlebar"
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('.titlebar-btn, .titlebar-path')) return
        toggle()
      }}
    >
      <div className="titlebar-left">
        {parts && (
          <button
            className="titlebar-path"
            title={`${filePath ?? ''} — click to copy`}
            onClick={(e) => {
              e.stopPropagation()
              void copyPath()
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className="titlebar-dir">{parts.dir}/</span>
            <span className="titlebar-file">{parts.base}</span>
          </button>
        )}
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          aria-label="Minimize"
          onClick={() => window.windowControls?.minimize()}
        >
          <MinimizeIcon />
        </button>
        <button
          className="titlebar-btn"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={toggle}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          aria-label="Close"
          onClick={() => window.windowControls?.close()}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

const TRACK_SIZE = 12
const THUMB_INSET = 0
const MIN_THUMB = 32

interface DragState {
  axis: 'v' | 'h'
  pointerId: number
  startPointer: number
  startScroll: number
  trackTravel: number
  scrollMax: number
}

interface CustomScrollProps {
  className?: string
  children: ReactNode
}

export default function CustomScroll({ className, children }: CustomScrollProps): React.JSX.Element {
  const viewRef = useRef<HTMLDivElement>(null)
  const vThumbRef = useRef<HTMLDivElement>(null)
  const hThumbRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ v: 0, h: 0, vSize: 0, hSize: 0 })
  const dragRef = useRef<DragState | null>(null)
  const [vVisible, setVVisible] = useState(false)
  const [hVisible, setHVisible] = useState(false)

  const sync = useCallback(() => {
    const el = viewRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = el

    const showV = scrollHeight > clientHeight + 1
    const showH = scrollWidth > clientWidth + 1
    setVVisible(showV)
    setHVisible(showH)

    // Vertical thumb: track spans view height minus horizontal track.
    const vth = vThumbRef.current
    if (vth && showV && scrollHeight > clientHeight) {
      const vTrackLen = clientHeight - (showH ? TRACK_SIZE : 0)
      const thumbLen = Math.min(
        vTrackLen - THUMB_INSET * 2,
        Math.max(MIN_THUMB, (clientHeight / scrollHeight) * vTrackLen)
      )
      const top = (scrollTop / (scrollHeight - clientHeight)) * (vTrackLen - thumbLen)
      posRef.current.v = top
      posRef.current.vSize = thumbLen
      vth.style.height = `${thumbLen}px`
      vth.style.transform = `translateY(${top}px)`
    }

    // Horizontal thumb: track spans view width minus vertical track.
    const hth = hThumbRef.current
    if (hth && showH && scrollWidth > clientWidth) {
      const trackLen = clientWidth - (showV ? TRACK_SIZE : 0)
      const thumbLen = Math.min(
        trackLen - THUMB_INSET * 2,
        Math.max(MIN_THUMB, (clientWidth / scrollWidth) * trackLen)
      )
      const left = (scrollLeft / (scrollWidth - clientWidth)) * (trackLen - thumbLen)
      posRef.current.h = left
      posRef.current.hSize = thumbLen
      hth.style.width = `${thumbLen}px`
      hth.style.transform = `translateX(${left}px)`
    }
  }, [])

  useEffect(() => {
    sync()
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver(() => sync())
    ro.observe(el)
    return () => ro.disconnect()
  }, [sync, children])

  const beginDrag =
    (axis: 'v' | 'h') =>
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      const el = viewRef.current
      const thumb = axis === 'v' ? vThumbRef.current : hThumbRef.current
      if (!el || !thumb) return
      e.preventDefault()
      e.stopPropagation()
      try {
        thumb.setPointerCapture(e.pointerId)
      } catch {
        // Pointer capture unavailable — drag still works via move/up on thumb.
      }
      const trackLen =
        axis === 'v'
          ? el.clientHeight - (hVisible ? TRACK_SIZE : 0)
          : el.clientWidth - (vVisible ? TRACK_SIZE : 0)
      const thumbLen = axis === 'v' ? thumb.clientHeight : thumb.clientWidth
      dragRef.current = {
        axis,
        pointerId: e.pointerId,
        startPointer: axis === 'v' ? e.clientY : e.clientX,
        startScroll: axis === 'v' ? el.scrollTop : el.scrollLeft,
        trackTravel: Math.max(1, trackLen - thumbLen),
        scrollMax:
          axis === 'v' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
      }
    }

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    const el = viewRef.current
    if (!d || !el || e.pointerId !== d.pointerId) return
    const pointer = d.axis === 'v' ? e.clientY : e.clientX
    const next = d.startScroll + ((pointer - d.startPointer) * d.scrollMax) / d.trackTravel
    if (d.axis === 'v') el.scrollTop = next
    else el.scrollLeft = next
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current && e.pointerId === dragRef.current.pointerId) dragRef.current = null
  }

  const onTrackDown =
    (axis: 'v' | 'h') =>
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      // Thumb has its own drag handler — only page-jump on bare track clicks.
      if (e.target !== e.currentTarget) return
      const el = viewRef.current
      if (!el) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (axis === 'v') {
        const clickY = e.clientY - rect.top
        const center = posRef.current.v + posRef.current.vSize / 2
        el.scrollBy({ top: (clickY < center ? -1 : 1) * el.clientHeight * 0.9 })
      } else {
        const clickX = e.clientX - rect.left
        const center = posRef.current.h + posRef.current.hSize / 2
        el.scrollBy({ left: (clickX < center ? -1 : 1) * el.clientWidth * 0.9 })
      }
    }

  return (
    <div className={className ? `cs ${className}` : 'cs'}>
      <div ref={viewRef} className="cs-view" tabIndex={0} onScroll={sync}>
        {children}
      </div>
      {vVisible && (
        <div
          className="cs-track cs-track-v"
          style={{ bottom: hVisible ? TRACK_SIZE : 0 }}
          onPointerDown={onTrackDown('v')}
        >
          <div
            ref={vThumbRef}
            className="cs-thumb"
            onPointerDown={beginDrag('v')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
      )}
      {hVisible && (
        <div
          className="cs-track cs-track-h"
          style={{ right: vVisible ? TRACK_SIZE : 0 }}
          onPointerDown={onTrackDown('h')}
        >
          <div
            ref={hThumbRef}
            className="cs-thumb"
            onPointerDown={beginDrag('h')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
      )}
      {vVisible && hVisible && <div className="cs-corner" />}
    </div>
  )
}

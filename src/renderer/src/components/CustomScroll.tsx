import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { sliderRatio, thumbGeometry } from '../scrollMath'

const TRACK_SIZE = 12

interface DragState {
  axis: 'v' | 'h'
  pointerId: number
  startPointer: number
  startScroll: number
  /** Track px per content px at dragstart (VSCode's computedSliderRatio). */
  ratio: number
}

interface CustomScrollProps {
  className?: string
  children: ReactNode
  annotations?: Array<{ top: number; height: number; kind: 'add' | 'del' }>
  /** New-file line number to scroll into view (centered); null disables. */
  revealLine?: number | null
}

export default function CustomScroll({
  className,
  children,
  annotations,
  revealLine = null
}: CustomScrollProps): React.JSX.Element {
  const viewRef = useRef<HTMLDivElement>(null)
  const vTrackRef = useRef<HTMLDivElement>(null)
  const vThumbRef = useRef<HTMLDivElement>(null)
  const hThumbRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ v: 0, h: 0, vSize: 0, hSize: 0 })
  const dragRef = useRef<DragState | null>(null)
  const [vVisible, setVVisible] = useState(false)
  const [hVisible, setHVisible] = useState(false)
  const [vTrackH, setVTrackH] = useState(0)

  const sync = useCallback(() => {
    const el = viewRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = el

    const showV = scrollHeight > clientHeight + 1
    const showH = scrollWidth > clientWidth + 1
    setVVisible(showV)
    setHVisible(showH)
    const trackH = vTrackRef.current?.clientHeight ?? 0
    setVTrackH((prev) => (prev === trackH ? prev : trackH))

    // Vertical thumb (bottom-anchored: thumb bottom fraction == viewport bottom fraction).
    const vth = vThumbRef.current
    if (vth && showV && scrollHeight > clientHeight) {
      const vTrackLen = clientHeight - (showH ? TRACK_SIZE : 0)
      const { top, size } = thumbGeometry(scrollTop, scrollHeight, clientHeight, vTrackLen)
      posRef.current.v = top
      posRef.current.vSize = size
      vth.style.height = `${size}px`
      vth.style.transform = `translateY(${top}px)`
    }

    // Horizontal thumb.
    const hth = hThumbRef.current
    if (hth && showH && scrollWidth > clientWidth) {
      const trackLen = clientWidth - (showV ? TRACK_SIZE : 0)
      const { top: left, size } = thumbGeometry(scrollLeft, scrollWidth, clientWidth, trackLen)
      posRef.current.h = left
      posRef.current.hSize = size
      hth.style.width = `${size}px`
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

  useEffect(() => {
    if (revealLine === null || revealLine === undefined) return
    viewRef.current
      ?.querySelector(`[data-lno="${revealLine}"]`)
      ?.scrollIntoView({ block: 'center' })
  }, [revealLine, children])

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
      const scrollSize = axis === 'v' ? el.scrollHeight : el.scrollWidth
      const clientSize = axis === 'v' ? el.clientHeight : el.clientWidth
      const thumbLen = axis === 'v' ? thumb.clientHeight : thumb.clientWidth
      dragRef.current = {
        axis,
        pointerId: e.pointerId,
        startPointer: axis === 'v' ? e.clientY : e.clientX,
        startScroll: axis === 'v' ? el.scrollTop : el.scrollLeft,
        ratio: sliderRatio(scrollSize, clientSize, trackLen, thumbLen)
      }
    }

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    const el = viewRef.current
    if (!d || !el || e.pointerId !== d.pointerId || d.ratio <= 0) return
    const pointer = d.axis === 'v' ? e.clientY : e.clientX
    // VSCode getDesiredScrollPositionFromDelta: move by delta / ratio.
    const next = d.startScroll + (pointer - d.startPointer) / d.ratio
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
        // VSCode pages by a full viewport, not jump-to-position.
        el.scrollBy({ top: (clickY < center ? -1 : 1) * el.clientHeight })
      } else {
        const clickX = e.clientX - rect.left
        const center = posRef.current.h + posRef.current.hSize / 2
        el.scrollBy({ left: (clickX < center ? -1 : 1) * el.clientWidth })
      }
    }

  return (
    <div className={className ? `cs ${className}` : 'cs'}>
      <div ref={viewRef} className="cs-view" tabIndex={0} onScroll={sync}>
        {children}
      </div>
      {vVisible && (
        <div
          ref={vTrackRef}
          className="cs-track cs-track-v"
          style={{ bottom: hVisible ? TRACK_SIZE : 0 }}
          onPointerDown={onTrackDown('v')}
        >
          {annotations?.map((a, i) => {
            // VSCode MIN_DECORATION_HEIGHT: sub-6px runs become centered 6px blocks.
            const pxTop = a.top * vTrackH
            const pxH = a.height * vTrackH
            const style =
              vTrackH > 0 && pxH < 6
                ? {
                    top: Math.min(Math.max(pxTop + pxH / 2 - 3, 0), Math.max(0, vTrackH - 6)),
                    height: Math.min(6, vTrackH)
                  }
                : { top: `${a.top * 100}%`, height: `${Math.max(a.height * 100, 0.4)}%` }
            return (
              <div key={i} className={`cs-marker cs-marker-${a.kind}`} style={style} />
            )
          })}
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

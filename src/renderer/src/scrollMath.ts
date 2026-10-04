/**
 * Slider geometry ported from VSCode's ScrollbarState._computeValues
 * (src/vs/base/browser/ui/scrollbar/scrollbarState.ts):
 * travel mapping with an artificially enlarged minimum slider so it stays
 * grabbable. Track click pages by a full viewport, drag moves by delta/ratio.
 */
export const MINIMUM_SLIDER_SIZE = 20

export interface ThumbGeometry {
  /** px from track top. */
  top: number
  /** px tall. */
  size: number
}

export function thumbGeometry(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  trackLen: number
): ThumbGeometry {
  if (scrollHeight <= 0 || trackLen <= 0 || clientHeight <= 0) {
    return { top: 0, size: 0 }
  }
  if (!(scrollHeight > clientHeight)) {
    return { top: 0, size: trackLen }
  }
  const size = Math.round(
    Math.max(MINIMUM_SLIDER_SIZE, Math.floor((clientHeight * trackLen) / scrollHeight))
  )
  const ratio = sliderRatio(scrollHeight, clientHeight, trackLen, size)
  return { top: Math.round(scrollTop * ratio), size }
}

/** Track px per content px. Zero when nothing scrolls or the thumb fills the track. */
export function sliderRatio(
  scrollHeight: number,
  clientHeight: number,
  trackLen: number,
  size: number
): number {
  if (scrollHeight <= clientHeight || trackLen - size <= 0) return 0
  return (trackLen - size) / (scrollHeight - clientHeight)
}

/** Inverse: scrollTop for a thumb sitting at topPx. */
export function scrollTopForThumbTop(topPx: number, ratio: number): number {
  if (ratio <= 0) return 0
  return topPx / ratio
}

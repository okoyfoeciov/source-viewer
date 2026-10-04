/** Copy text to the clipboard via the main process, with renderer fallbacks. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await window.electronClipboard?.writeText(text)
    return true
  } catch {
    // Fall through to renderer-side fallbacks.
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fall through to the legacy textarea path.
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Format a file:line or file:start-end reference for the clipboard. */
export function formatLineRef(filePath: string, start: number, end: number): string {
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return lo === hi ? `${filePath}:${lo}` : `${filePath}:${lo}-${hi}`
}

export interface DedupeState {
  raw: string
  at: number
}

/**
 * Decides whether a picker prompt may (re)show for a query. Showing it
 * records a squelch so Alt+Tab cycles don't nag; the squelch expires after
 * a minute so genuine later intent still works.
 */
const PICKER_SQUELCH_MS = 60000

export interface PickerSquelch {
  query: string
  until: number
}

export function shouldResendPicker(
  query: string,
  squelch: PickerSquelch | null,
  now: number
): { send: boolean; squelch: PickerSquelch } {
  if (squelch !== null && squelch.query === query && now < squelch.until) {
    return { send: false, squelch }
  }
  return { send: true, squelch: { query, until: now + PICKER_SQUELCH_MS } }
}

/**
 * Skip handling identical clipboard text twice in a row (e.g. rapid
 * focus/blur cycles with unchanged content). Skipping is safe — same text
 * means the same file is already open (or was just attempted).
 */
const REDUNDANT_WINDOW_MS = 2000

export function shouldHandle(
  raw: string,
  prev: DedupeState | null,
  now: number
): { handle: boolean; state: DedupeState } {
  if (prev !== null && prev.raw === raw && now - prev.at < REDUNDANT_WINDOW_MS) {
    return { handle: false, state: prev }
  }
  return { handle: true, state: { raw, at: now } }
}

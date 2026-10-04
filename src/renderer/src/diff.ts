export type DiffLineType = 'context' | 'add' | 'del'

export interface DiffLine {
  type: DiffLineType
  oldNo: number | null
  newNo: number | null
  text: string
  noNewline: boolean
}

export interface DiffHunk {
  header: string
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

export interface FullLine {
  type: DiffLineType
  oldNo: number | null
  newNo: number | null
  text: string
  noNewline: boolean
}

export interface ChangeMarker {
  /** Fraction of the NEW file's height where the run starts (0..1). */
  top: number
  /** Fraction of the NEW file's height the run spans. */
  height: number
  kind: 'add' | 'del'
}

/**
 * Collapse consecutive changed rows into overview-ruler markers positioned
 * in new-file coordinates: a marker at fraction f means the change sits at
 * fraction f of the file — the same ratio the proportional thumb uses, so
 * thumb-bottom-touching-marker ⟺ change at viewport bottom.
 * Deletions (no new-file line of their own) sit at the gap they were cut from.
 */
export function markersForLines(lines: FullLine[]): ChangeMarker[] {
  let totalNew = 0
  for (const line of lines) {
    if (line.newNo !== null && line.newNo > totalNew) totalNew = line.newNo
  }
  if (totalNew === 0) totalNew = 1

  const markers: ChangeMarker[] = []
  let newCursor = 1
  let lastF = 0
  let runKind: 'add' | 'del' | null = null
  let runStartF = 0
  const flush = (): void => {
    if (runKind === null) return
    markers.push({ top: runStartF, height: Math.max(0, lastF + 1 / totalNew - runStartF), kind: runKind })
    runKind = null
  }

  for (const line of lines) {
    const kind = line.type === 'context' ? null : line.type
    const posF = ((line.newNo ?? newCursor) - 1) / totalNew
    if (kind !== runKind) {
      flush()
      runKind = kind
      runStartF = posF
    }
    lastF = posF
    if (line.newNo !== null) newCursor = line.newNo + 1
  }
  flush()
  return markers
}

const HUNK_HEAD = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/**
 * Parse one file's unified diff (as produced by `git diff`) into hunks with
 * computed old/new line numbers. File-level preamble (`diff --git`, `---`,
 * `+++`, …) is skipped; `\\ No newline` markers attach to the line above.
 */
export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  for (const raw of text.split('\n')) {
    const head = HUNK_HEAD.exec(raw)
    if (head) {
      const hunk: DiffHunk = {
        header: raw,
        oldStart: parseInt(head[1], 10),
        newStart: parseInt(head[3], 10),
        lines: []
      }
      oldNo = hunk.oldStart
      newNo = hunk.newStart
      current = hunk
      hunks.push(current)
      continue
    }
    if (!current) continue // preamble
    if (raw.startsWith('\\')) {
      const prev = current.lines[current.lines.length - 1]
      if (prev) prev.noNewline = true
      continue
    }
    const kind = raw[0]
    const body = raw.slice(1)
    if (kind === ' ') {
      current.lines.push({ type: 'context', oldNo: oldNo++, newNo: newNo++, text: body, noNewline: false })
    } else if (kind === '-') {
      current.lines.push({ type: 'del', oldNo: oldNo++, newNo: null, text: body, noNewline: false })
    } else if (kind === '+') {
      current.lines.push({ type: 'add', oldNo: null, newNo: newNo++, text: body, noNewline: false })
    }
    // Anything else (e.g. trailing empty split) is ignored.
  }
  return hunks
}

/**
 * Expand hunks into the full current file: unchanged gaps between hunks
 * become context lines, deleted lines stay inline at their position.
 */
export function buildFullFile(content: string, hunks: DiffHunk[]): FullLine[] {
  const src = content.split('\n')
  if (src.length > 0 && src[src.length - 1] === '' && content.endsWith('\n')) src.pop()

  const out: FullLine[] = []
  let oldCursor = 1
  let newCursor = 1
  const gap = (toNew: number): void => {
    while (newCursor < toNew && newCursor <= src.length) {
      out.push({
        type: 'context',
        oldNo: oldCursor,
        newNo: newCursor,
        text: src[newCursor - 1] ?? '',
        noNewline: false
      })
      oldCursor++
      newCursor++
    }
  }

  for (const hunk of hunks) {
    gap(hunk.newStart)
    for (const line of hunk.lines) {
      out.push({
        type: line.type,
        oldNo: line.oldNo,
        newNo: line.newNo,
        text: line.text,
        noNewline: line.noNewline
      })
      if (line.oldNo !== null) oldCursor = line.oldNo + 1
      if (line.newNo !== null) newCursor = line.newNo + 1
    }
  }
  gap(Number.MAX_SAFE_INTEGER)
  return out
}

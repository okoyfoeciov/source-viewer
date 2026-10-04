import { execFile } from 'child_process'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const MAX_DIFF_BYTES = 512 * 1024

interface ExecError extends Error {
  code?: number | string
  stdout?: string
}

/**
 * Uncommitted changes (staged + unstaged vs HEAD) for a file: the unified
 * diff plus the HEAD version (for highlighting deleted lines).
 * Returns null when there is nothing to show: not a repo, outside the repo,
 * untracked, unchanged, binary, or too large.
 */
export interface FileDiff {
  diff: string
  /** HEAD content; null when unavailable or too large (deletions render plain). */
  head: string | null
}

export async function getFileDiff(filePath: string): Promise<FileDiff | null> {
  const dir = path.dirname(filePath)

  let root: string
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      timeout: 5000
    })
    root = stdout.trim()
  } catch {
    return null
  }
  if (!root) return null

  const rel = path.relative(root, filePath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null

  // Diff and HEAD content are independent — fetch concurrently.
  const [diffText, headText] = await Promise.all([runDiff(root, rel), runHead(root, rel)])
  if (diffText === null) return null
  return { diff: diffText, head: headText }
}

async function runDiff(root: string, rel: string): Promise<string | null> {
  let out = ''
  try {
    await execFileAsync(
      'git',
      ['-C', root, 'diff', 'HEAD', '--exit-code', '--no-color', '--no-ext-diff', '-U3', '--', rel],
      { timeout: 10000, maxBuffer: 8 * 1024 * 1024 }
    )
    return null // exit 0 = no differences
  } catch (e) {
    const err = e as ExecError
    if (err.code !== 1) return null // real git error (no HEAD, etc.)
    out = err.stdout ?? ''
  }
  if (!out.trim() || out.length > MAX_DIFF_BYTES) return null
  if (/^Binary /m.test(out)) return null
  return out
}

async function runHead(root: string, rel: string): Promise<string | null> {
  try {
    const shown = await execFileAsync('git', ['-C', root, 'show', `HEAD:${rel}`], {
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024
    })
    return shown.stdout.length > MAX_DIFF_BYTES ? null : shown.stdout
  } catch {
    return null // e.g. staged-new file: no HEAD version exists
  }
}

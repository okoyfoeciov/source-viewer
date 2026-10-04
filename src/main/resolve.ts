import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface NormalizedPath {
  /** As-typed candidate (quotes/whitespace stripped). */
  raw: string
  /** Candidate with a trailing :line[:col] or :start-end suffix stripped (== raw when none). */
  stripped: string
  kind: 'absolute' | 'relative'
  /** 1-based target line/range in the opened file, if the suffix named one. */
  selection: { start: number; end: number } | null
}

const LINE_SUFFIX = /^(.*?):(\d+)(?::(\d+))?$/
const RANGE_SUFFIX = /^(.*?):(\d+)-(\d+)$/
const MAX_MATCHES = 10

/**
 * Normalize one clipboard blob into open candidates.
 * Returns null when the clipboard clearly isn't a single file path
 * (empty, multi-line, URL, shell flag, ...).
 */
export function normalizeClipboard(input: string): NormalizedPath | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed.includes('\n')) return null

  // Strip one layer of surrounding quotes/backticks.
  let text = trimmed
  const first = text[0]
  const last = text[text.length - 1]
  if (text.length >= 2 && first === last && (first === '"' || first === "'" || first === '`')) {
    text = text.slice(1, -1).trim()
    if (!text) return null
  }

  if (/^(https?:\/\/|file:\/\/|mailto:)/i.test(text)) return null
  if (text.startsWith('-')) return null

  // agents love `path/to/file.ts:12`, `:12:3` or `:12-20` — keep the
  // line/range, but only treat it as a suffix when the prefix is path-like.
  let stripped = text
  let selection: { start: number; end: number } | null = null
  const validPrefix = (p: string | undefined): boolean =>
    !!p && p.length > 0 && !p.endsWith(':')
  const m = LINE_SUFFIX.exec(text)
  const r = RANGE_SUFFIX.exec(text)
  if (r && validPrefix(r[1])) {
    const start = parseInt(r[2], 10)
    const end = parseInt(r[3], 10)
    if (start >= 1 && end >= start) {
      stripped = r[1]
      selection = { start, end }
    }
  } else if (m && validPrefix(m[1])) {
    const line = parseInt(m[2], 10)
    if (line >= 1) {
      stripped = m[1]
      selection = { start: line, end: line }
    }
  }

  // Expand ~ and ./ for the filesystem checks (display keeps raw form).
  const expand = (p: string): string => {
    if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(1))
    if (p.startsWith('./')) return p.slice(2)
    return p
  }

  const probe = expand(stripped)
  if (!probe) return null
  return { raw: text, stripped, kind: path.isAbsolute(probe) ? 'absolute' : 'relative', selection }
}

/** Expand a NormalizedPath into ordered filesystem candidates (deduped). */
export function expandUser(p: string): string {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(1))
  if (p.startsWith('./')) return p.slice(2)
  return p
}

const PUBLISHED_DIRS = ['out', 'lib', 'dist', 'build']

/**
 * Agents often cite TypeScript sources (stack traces, source maps) that
 * published node_modules don't ship — only compiled output. If an absolute
 * `<pkg>/src/name.ts(x)` is missing, try its published counterpart
 * (`out/`, `lib/`, `dist/`, `build/` + `.js`, then `.d.ts`).
 */
export async function resolvePublishedFallback(absPath: string): Promise<string | null> {
  if (!absPath.endsWith('.ts') && !absPath.endsWith('.tsx')) return null
  const marker = '/node_modules/'
  const idx = absPath.lastIndexOf(marker)
  if (idx === -1) return null
  const after = absPath.slice(idx + marker.length)
  const m = /^(.*)\/src\/(.*)\.tsx?$/.exec(after)
  if (!m) return null
  const base = absPath.slice(0, idx + marker.length) + m[1]
  const rest = m[2]
  for (const dir of PUBLISHED_DIRS) {
    for (const ext of ['.js', '.d.ts']) {
      const cand = `${base}/${dir}/${rest}${ext}`
      try {
        const stat = await fs.stat(cand)
        if (stat.isFile()) return cand
      } catch {
        // Try the next candidate.
      }
    }
  }
  return null
}

/**
 * Live agent working dirs, `claude` first (most likely source, listed first
 * in the picker) — but all in ONE tier: any ambiguity shows the picker.
 */
export async function collectRoots(): Promise<string[]> {
  const live = await getLiveAgentRoots().catch(() => ({
    claude: [] as string[],
    other: [] as string[]
  }))
  const seen = new Set<string>()
  const out: string[] = []
  for (const dir of [...live.claude, ...live.other]) {
    const norm = path.normalize(dir)
    if (!seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}

/** Resolve a relative path against a single dir. Returns the file or null. */
export async function resolveInDir(dir: string, relPath: string): Promise<string | null> {
  const full = path.resolve(dir, relPath)
  try {
    const stat = await fs.stat(full)
    return stat.isFile() ? full : null
  } catch {
    return null
  }
}

/** Resolve a relative path against roots (in order). Returns existing files, capped. */
export async function resolveAgainstRoots(roots: string[], relPath: string): Promise<string[]> {
  const matches: string[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    const full = path.resolve(root, relPath)
    if (seen.has(full)) continue
    seen.add(full)
    try {
      const stat = await fs.stat(full)
      if (stat.isFile()) {
        matches.push(full)
        if (matches.length >= MAX_MATCHES) break
      }
    } catch {
      // Doesn't exist under this root — try the next one.
    }
  }
  return matches
}

// ---- live agent processes -------------------------------------------------

const AGENT_COMMANDS = new Set(['opencode', 'claude', 'codex'])

interface AgentProc {
  pid: number
  comm: string
}

async function getLiveAgentRoots(): Promise<{ claude: string[]; other: string[] }> {
  const procs = await listAgentProcs()
  if (procs.length === 0) return { claude: [], other: [] }
  const cwds =
    process.platform === 'darwin' ? await getMacCwds(procs) : await getLinuxCwds(procs)
  const claude: string[] = []
  const other: string[] = []
  for (const { comm, cwd } of cwds) {
    if (comm === 'claude') claude.push(cwd)
    else other.push(cwd)
  }
  return { claude, other }
}

async function listAgentProcs(): Promise<AgentProc[]> {
  // NOTE: flag shapes differ per platform — `ps -eo -o ...` is a syntax
  // error on Linux (procps), so the format flag must ride on the same argv
  // element as the selection flag set.
  // The tty column filters headless helpers: real agent TUIs own a tty
  // (ttys*/pts/*); Chrome native-host helpers and `opencode serve`
  // daemons show `?`/`??` and would otherwise pollute the roots.
  const args =
    process.platform === 'darwin'
      ? ['-ax', '-o', 'pid=,tty=,comm=']
      : ['-eo', 'pid=,tty=,comm=']
  const { stdout } = await execFileAsync('ps', args)
  const procs: AgentProc[] = []
  for (const line of stdout.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    const pid = parseInt(parts[0], 10)
    const tty = parts[1]
    // macOS script-wrapped binaries report a full path in comm=
    // (e.g. /Users/you/.local/bin/claude) — basename it.
    const comm = path.basename(parts.slice(2).join(' ')).toLowerCase()
    if (tty === '?' || tty === '??') continue
    if (Number.isFinite(pid) && pid !== process.pid && AGENT_COMMANDS.has(comm)) {
      procs.push({ pid, comm })
    }
  }
  return [...new Map(procs.map((p) => [p.pid, p])).values()]
}

async function getLinuxCwds(procs: AgentProc[]): Promise<Array<{ comm: string; cwd: string }>> {
  const roots: Array<{ comm: string; cwd: string }> = []
  for (const { pid, comm } of procs) {
    try {
      const cwd = await fs.readlink(`/proc/${pid}/cwd`)
      roots.push({ comm, cwd })
    } catch {
      // Process exited or not ours — skip.
    }
  }
  return roots
}

async function getMacCwds(procs: AgentProc[]): Promise<Array<{ comm: string; cwd: string }>> {
  if (procs.length === 0) return []
  // One lsof call for all pids: `-F pn` prints `p<pid>` / `n<path>` lines.
  const byPid = new Map(procs.map((p) => [p.pid, p.comm]))
  try {
    const { stdout } = await execFileAsync(
      'lsof',
      [
        '-a',
        '-p',
        procs.map((p) => p.pid).join(','),
        '-d',
        'cwd',
        '-F',
        'pn'
      ],
      { timeout: 5000 }
    )
    const roots: Array<{ comm: string; cwd: string }> = []
    let pid = 0
    for (const line of stdout.split('\n')) {
      if (line.startsWith('p')) pid = parseInt(line.slice(1), 10)
      else if (line.startsWith('n') && line.length > 1 && byPid.has(pid)) {
        roots.push({ comm: byPid.get(pid) as string, cwd: line.slice(1) })
      }
    }
    return roots
  } catch {
    return []
  }
}

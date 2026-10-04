import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface NormalizedPath {
  /** As-typed candidate (quotes/whitespace stripped). */
  raw: string
  /** Candidate with a trailing :line[:col] suffix stripped (== raw when none). */
  stripped: string
  kind: 'absolute' | 'relative'
  line: number | null
}

const LINE_SUFFIX = /^(.*?):(\d+)(?::(\d+))?$/
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

  // agents love `path/to/file.ts:12` or `:12:3` — keep the line number,
  // but only treat it as a suffix when the prefix part is path-like.
  let stripped = text
  let line: number | null = null
  const m = LINE_SUFFIX.exec(text)
  if (m && m[1].length > 0 && !m[1].endsWith(':')) {
    stripped = m[1]
    line = parseInt(m[2], 10)
  }

  // Expand ~ and ./ for the filesystem checks (display keeps raw form).
  const expand = (p: string): string => {
    if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(1))
    if (p.startsWith('./')) return p.slice(2)
    return p
  }

  const probe = expand(stripped)
  if (!probe) return null
  return { raw: text, stripped, kind: path.isAbsolute(probe) ? 'absolute' : 'relative', line }
}

/** Expand a NormalizedPath into ordered filesystem candidates (deduped). */
export function expandUser(p: string): string {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(1))
  if (p.startsWith('./')) return p.slice(2)
  return p
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
  const args =
    process.platform === 'darwin' ? ['-ax', '-o', 'pid=,comm='] : ['-eo', 'pid=,comm=']
  const { stdout } = await execFileAsync('ps', args)
  const procs: AgentProc[] = []
  for (const line of stdout.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 2) continue
    const pid = parseInt(parts[0], 10)
    const comm = path.basename(parts[parts.length - 1]).toLowerCase()
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
  // One lsof call for all pids: `-F pn` prints `p<pid>` / `n<path>` lines.
  const byPid = new Map(procs.map((p) => [p.pid, p.comm]))
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-a',
      '-p',
      procs.map((p) => p.pid).join(','),
      '-d',
      'cwd',
      '-F',
      'pn'
    ])
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

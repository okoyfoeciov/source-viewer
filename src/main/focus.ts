import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import type * as dbus from 'dbus-next'

const execFileAsync = promisify(execFile)

export interface FocusReading {
  /** Visible konsole tab id. */
  tab: number
  /** Foreground process in that tab. */
  pid: number
  comm: string
  cwd: string
  /** ms epoch of the reading. */
  t: number
}

export interface FocusDir {
  cwd: string
  /**
   * True when cwd is the focused tab's *foreground process* dir (Linux
   * Konsole reading, or Ghostty ≥1.4 `pid` + lsof). Callers may trust it
   * as a single root. False for Ghostty <1.4 shell cwd, which can't tell
   * apart tabs sharing a shell dir (e.g. repo root vs nested worktree).
   */
  exact: boolean
}

const POLL_MS = 500
const KONSOLE_WINDOW_PATH = '/Windows/1'
const KONSOLE_WINDOW_IFACE = 'org.kde.konsole.Window'
const KONSOLE_SESSION_IFACE = 'org.kde.konsole.Session'

// Ghostty exposes the focused shell cwd via AppleScript:
//   window -> selected tab -> focused terminal -> working directory.
// The `is running` guard matters: a bare `tell application "Ghostty"`
// would *launch* Ghostty when it isn't running.
const GHOSTTY_CWD_SCRIPT = [
  'if application "Ghostty" is running then',
  '  tell application "Ghostty"',
  '    if (count of windows) > 0 then',
  '      get working directory of focused terminal of selected tab of front window',
  '    end if',
  '  end tell',
  'end if'
].join('\n')

// Foreground PID of the focused terminal (Ghostty ≥1.4). Same `is running`
// guard: a bare tell would launch Ghostty when it isn't running.
const GHOSTTY_PID_SCRIPT = [
  'if application "Ghostty" is running then',
  '  tell application "Ghostty"',
  '    if (count of windows) > 0 then',
  '      get pid of focused terminal of selected tab of front window',
  '    end if',
  '  end tell',
  'end if'
].join('\n')

async function readProc(pid: number, file: 'comm' | 'cwd'): Promise<string | null> {
  try {
    if (file === 'comm') return (await fs.readFile(`/proc/${pid}/comm`, 'utf8')).trim()
    return await fs.readlink(`/proc/${pid}/cwd`)
  } catch {
    return null
  }
}

/**
 * Remembers which terminal tab is visible and what runs in it.
 * Everything is best-effort: any failure just yields no reading,
 * and resolution falls through to the live-roots tiers.
 *
 * Linux polls Konsole over DBus in the background (cheap). macOS has
 * no /proc and no Konsole, so there is no background poll — the Ghostty
 * focused-tab cwd is queried on demand via getFocusCwd() (one ~90ms
 * osascript per clipboard open, overlapping the live-roots scan).
 */
export class FocusWatcher {
  private bus: dbus.MessageBus | null = null
  private konsoleName: string | null = null
  private timer: NodeJS.Timeout | null = null
  private last: FocusReading | null = null

  start(): void {
    // macOS is on-demand (see getFocusCwd) — nothing to poll.
    if (process.platform === 'darwin') return
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), POLL_MS)
    if (this.timer.unref) this.timer.unref()
  }

  getLast(): FocusReading | null {
    return this.last
  }

  /**
   * Focused-tab working directory, or null when unknown.
   * Linux: cached Konsole reading (exact). macOS: Ghostty AppleScript —
   * exact foreground-agent cwd via the `pid` property on Ghostty ≥1.4,
   * shell cwd (inexact) on older Ghostty.
   */
  async getFocus(): Promise<FocusDir | null> {
    if (process.platform === 'darwin') return this.getMacFocus()
    const cwd = this.last?.cwd ?? null
    return cwd ? { cwd, exact: true } : null
  }

  /**
   * Ghostty focused-tab dir. Prefers the foreground process cwd via the
   * `pid` property (Ghostty ≥1.4, exact even when tabs share a shell dir);
   * falls back to the shell `working directory` (Ghostty 1.3, inexact).
   * Note the shell cwd is the *shell* cwd, not necessarily the agent cwd:
   * an agent may run in a subdir (e.g. `claude -w` worktrees). Callers
   * widen inexact readings with contained live-agent dirs.
   */
  private async getMacFocus(): Promise<FocusDir | null> {
    const pid = await this.getMacForegroundPid()
    if (pid !== null) {
      const cwd = await this.cwdOfPid(pid)
      if (cwd) return { cwd, exact: true }
    }
    const cwd = await this.getMacShellCwd()
    return cwd ? { cwd, exact: false } : null
  }

  /**
   * Foreground PID of Ghostty's selected tab (Ghostty ≥1.4, see
   * ghostty-org/ghostty#11592 / #11922). On older Ghostty the property
   * doesn't exist and osascript errors out — that just means inexact.
   */
  private async getMacForegroundPid(): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', GHOSTTY_PID_SCRIPT], {
        timeout: 3000
      })
      const pid = parseInt(stdout.trim(), 10)
      return Number.isFinite(pid) && pid > 0 ? pid : null
    } catch {
      return null
    }
  }

  private async cwdOfPid(pid: number): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'lsof',
        ['-a', '-p', String(pid), '-d', 'cwd', '-F', 'pn'],
        { timeout: 3000 }
      )
      for (const line of stdout.split('\n')) {
        if (line.startsWith('n') && line.length > 1) {
          return await this.asDir(line.slice(1))
        }
      }
    } catch {
      // Process exited between osascript and lsof — caller falls back.
    }
    return null
  }

  private async getMacShellCwd(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', GHOSTTY_CWD_SCRIPT], {
        timeout: 3000
      })
      return await this.asDir(stdout.trim())
    } catch {
      // Ghostty not running/installed, no windows, timeout — fall through.
      return null
    }
  }

  private async asDir(cwd: string): Promise<string | null> {
    if (!cwd || !path.isAbsolute(cwd)) return null
    try {
      const stat = await fs.stat(cwd)
      return stat.isDirectory() ? cwd : null
    } catch {
      return null
    }
  }

  private async poll(): Promise<void> {
    try {
      const name = await this.findKonsole()
      if (!name) return
      const bus = this.bus as dbus.MessageBus
      const winObj = await bus.getProxyObject(name, KONSOLE_WINDOW_PATH)
      const win = winObj.getInterface(KONSOLE_WINDOW_IFACE)
      const tab = (await win.currentSession()) as number
      const sessObj = await bus.getProxyObject(name, `/Sessions/${tab}`)
      const sess = sessObj.getInterface(KONSOLE_SESSION_IFACE)
      const pid = (await sess.foregroundProcessId()) as number
      const [comm, cwd] = await Promise.all([readProc(pid, 'comm'), readProc(pid, 'cwd')])
      if (!comm || !cwd) return
      this.last = { tab, pid, comm, cwd, t: Date.now() }
    } catch {
      // Konsole restarted, tab closed mid-poll, bus hiccup — next tick retries.
      this.konsoleName = null
    }
  }

  private async findKonsole(): Promise<string | null> {
    // dbus-next is Linux-only in practice — lazy-load so macOS/Windows
    // never pay for (or break on) the import.
    if (!this.bus) {
      const { sessionBus } = await import('dbus-next')
      this.bus = sessionBus()
    }
    if (this.konsoleName) return this.konsoleName
    const bus = this.bus
    const dbusObj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    const dbusIface = dbusObj.getInterface('org.freedesktop.DBus')
    const names = (await dbusIface.ListNames()) as string[]
    for (const name of names) {
      if (!name.startsWith(':')) continue
      try {
        const pid = (await dbusIface.GetConnectionUnixProcessID(name)) as number
        const comm = await readProc(pid, 'comm')
        if (comm === 'konsole') {
          this.konsoleName = name
          return name
        }
      } catch {
        // Name vanished mid-scan — keep looking.
      }
    }
    return null
  }
}

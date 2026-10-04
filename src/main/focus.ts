import { promises as fs } from 'fs'
import * as dbus from 'dbus-next'

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

const POLL_MS = 500
const KONSOLE_WINDOW_PATH = '/Windows/1'
const KONSOLE_WINDOW_IFACE = 'org.kde.konsole.Window'
const KONSOLE_SESSION_IFACE = 'org.kde.konsole.Session'

async function readProc(pid: number, file: 'comm' | 'cwd'): Promise<string | null> {
  try {
    if (file === 'comm') return (await fs.readFile(`/proc/${pid}/comm`, 'utf8')).trim()
    return await fs.readlink(`/proc/${pid}/cwd`)
  } catch {
    return null
  }
}

/**
 * Remembers which konsole tab is visible and what runs in it.
 * Everything is best-effort: any failure just yields no reading,
 * and resolution falls through to the live-roots tiers.
 */
export class FocusWatcher {
  private bus: dbus.MessageBus | null = null
  private konsoleName: string | null = null
  private timer: NodeJS.Timeout | null = null
  private last: FocusReading | null = null

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), POLL_MS)
    if (this.timer.unref) this.timer.unref()
  }

  getLast(): FocusReading | null {
    return this.last
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
    if (!this.bus) this.bus = dbus.sessionBus()
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

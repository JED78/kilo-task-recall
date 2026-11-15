/**
 * Kilo Task Recall — plugin TUI para Kilo Code CLI.
 *
 * Módulo: { id, tui } (forma verificada en @kilocode/plugin/dist/tui.d.ts).
 * Se registra en el array "plugin" de C:\\Users\\delac\\.config\\kilo\\tui.json.
 *
 * Flujo:
 *   api.event.on("session.idle") →
 *     1. ignorar subagentes (Session.parentID)
 *     2. obtener mensajes + parts del turno (api.state.session.messages / api.state.part)
 *     3. resumir turno con el motor puro (src/recall-engine.ts)
 *     4. deduplicar por (sessionID + assistantMessageID) en memoria + api.kv
 *     5. toast (api.ui.toast) + notificación opcional (api.attention.notify)
 *     6. registrar evidencia en %LOCALAPPDATA%\\kilo-task-recall\\turns.jsonl
 *
 * Aislamiento multi-terminal: cada proceso TUI procesa sus propios eventos del
 * bus y, además, se exige coincidencia entre la sesión del evento y lo que
 * muestra esta terminal (api.route.current) o, en "home", entre el directorio
 * de la sesión y el directorio de trabajo (api.state.path.directory).
 */

import * as childProcess from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import type { TuiPluginApi } from "@kilocode/plugin/tui"

import {
  archiveLogName,
  buildOsNotifyCommand,
  dedupKey,
  formatRecallMessage,
  isSeen,
  isSubagentSession,
  parseGitHead,
  projectNameFromDirectory,
  pushSeen,
  shouldRotateLog,
  summarizeTurn,
  toLocalDateString,
  turnPassesFilters,
  type EngineMessage,
  type EngineTextPart,
} from "./recall-engine.ts"

export interface KiloTaskRecallOptions {
  enabled?: boolean
  showOriginalPrompt?: boolean
  showDuration?: boolean
  showProject?: boolean
  showNotifications?: boolean
  maxPromptDisplayLength?: number
  toastDurationMs?: number
  logTurns?: boolean
  strictRouteMatch?: boolean
  /** Duración mínima del turno en ms; turnos más cortos no muestran toast. */
  minDurationMs?: number
  /** Proyectos (nombre del directorio) cuyo turno se silencia. */
  ignoreProjects?: string[]
  /** Patrones de regex (código fuente) que silencian por texto del prompt. */
  ignorePromptPatterns?: string[]
  /** Añade la rama git del proyecto al toast (leída de .git/HEAD). */
  showGitBranch?: boolean
  /** Notificación del sistema operativo (balloon/notify-send/osascript). */
  osNotifications?: boolean
  /** Tamaño máximo de turns.jsonl antes de rotarlo (bytes; 0 = sin rotación). */
  logMaxBytes?: number
}

const DEFAULTS: Required<KiloTaskRecallOptions> = {
  enabled: true,
  showOriginalPrompt: true,
  showDuration: true,
  showProject: true,
  showNotifications: false,
  maxPromptDisplayLength: 2000,
  toastDurationMs: 0, // 0 = persistente hasta click del usuario
  logTurns: true,
  strictRouteMatch: true,
  minDurationMs: 0,
  ignoreProjects: [],
  ignorePromptPatterns: [],
  showGitBranch: false,
  osNotifications: false,
  logMaxBytes: 5 * 1024 * 1024,
}

const KV_SEEN_KEY = "ktr:seen-keys"
const SEEN_LIMIT = 200

/** Directorio de evidencia: %LOCALAPPDATA%\\kilo-task-recall en Windows. */
export function evidenceDir(): string {
  const base =
    process.env.LOCALAPPDATA ||
    (process.env.HOME ? path.join(process.env.HOME, ".local", "share") : os.tmpdir())
  return path.join(base, "kilo-task-recall")
}

interface EventProps {
  sessionID?: string
}

interface MinimalSession {
  id: string
  parentID?: string | null
  directory?: string
}

/** Helper defensivo: propiedades del evento del bus. */
function eventProps(event: unknown): EventProps {
  const e = event as { properties?: EventProps } | EventProps
  return (e && typeof e === "object" && "properties" in e ? e.properties : e) ?? {}
}

/** ¿El evento pertenece a ESTA terminal? (regla route + directory). */
export function belongsToThisTui(
  session: MinimalSession | undefined,
  route: { name: string; params?: { sessionID?: string } } | undefined,
  workdir: string | undefined,
  strict: boolean,
): boolean {
  if (!strict) return true
  if (route && route.name === "session" && route.params?.sessionID) {
    return route.params.sessionID === session?.id
  }
  if (route && route.name === "home") {
    if (!session?.directory || !workdir) return false
    const norm = (s: string) => s.replace(/[\\/]+$/, "").toLowerCase()
    return norm(session.directory) === norm(workdir)
  }
  return false
}

/** Rama git del proyecto, leída de `<dir>/.git/HEAD` (best-effort, sin spawn). */
export function gitBranchFromDirectory(directory: string | null | undefined): string | null {
  if (!directory) return null
  try {
    const head = fs.readFileSync(path.join(directory, ".git", "HEAD"), "utf8")
    return parseGitHead(head)
  } catch {
    return null
  }
}

/** Rotación del log: mueve turns.jsonl a turns-<día>.jsonl cuando supera maxBytes. */
export function rotateLogIfNeeded(dir: string, maxBytes: number): void {
  try {
    if (maxBytes <= 0) return
    const file = path.join(dir, "turns.jsonl")
    let size = 0
    try {
      size = fs.statSync(file).size
    } catch {
      return // no existe: nada que rotar
    }
    if (!shouldRotateLog(size, maxBytes)) return
    const target = path.join(dir, archiveLogName(toLocalDateString(new Date())))
    // Evitar sobreescribir un archivo del mismo día: sufijo con hora.
    let final = target
    if (fs.existsSync(target)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-")
      final = target.replace(/\.jsonl$/, `-${stamp}.jsonl`)
    }
    fs.renameSync(file, final)
  } catch {
    /* la rotación nunca debe romper el recordatorio */
  }
}

async function appendTurnLog(
  dir: string,
  record: Record<string, unknown>,
  maxBytes = 0,
): Promise<string | null> {
  try {
    fs.mkdirSync(dir, { recursive: true })
    if (maxBytes > 0) rotateLogIfNeeded(dir, maxBytes)
    const file = path.join(dir, "turns.jsonl")
    fs.appendFileSync(file, JSON.stringify(record) + "\n", "utf8")
    return file
  } catch {
    return null // el recordatorio nunca debe fallar por el log
  }
}

/** Notificación del SO: construye el comando puro y lo lanza best-effort. */
function notifyOs(platform: string, title: string, message: string): void {
  try {
    const notif = buildOsNotifyCommand(platform, title, message)
    if (!notif) return
    const c = childProcess.spawn(notif.cmd, notif.args, {
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    })
    c.on("error", () => {
      /* sin notificador instalado: silencioso */
    })
    c.unref()
  } catch {
    /* best-effort */
  }
}

export const KiloTaskRecall = async (
  api: TuiPluginApi,
  options: KiloTaskRecallOptions | undefined,
): Promise<void> => {
  const cfg: Required<KiloTaskRecallOptions> = { ...DEFAULTS, ...(options ?? {}) }
  if (!cfg.enabled) return

  // Dedup persistente por TUI (api.kv).
  let seen: string[] = []
  try {
    const stored = (await api.kv.get(KV_SEEN_KEY)) as unknown
    if (Array.isArray(stored)) seen = stored.filter((k) => typeof k === "string")
  } catch {
    /* kv sin datos previos */
  }

  const persistSeen = async (): Promise<void> => {
    try {
      await api.kv.set(KV_SEEN_KEY, seen)
    } catch {
      /* persistencia best-effort; el Set en memoria sigue protegiendo */
    }
  }

  const onIdle = async (event: unknown): Promise<void> => {
    try {
      const { sessionID } = eventProps(event)
      if (!sessionID) return

      const session = (await api.state.session.get(sessionID)) as MinimalSession | undefined
      if (!session || isSubagentSession(session)) return

      if (
        belongsToThisTui(
          session,
          api.route.current as { name: string; params?: { sessionID?: string } },
          api.state.path.directory,
          cfg.strictRouteMatch,
        )
      ) {
        // pertenece a esta terminal → continuar
      } else {
        return
      }

      const messages = (await api.state.session.messages(sessionID)) as EngineMessage[]
      const partsByMessage: Record<string, EngineTextPart[] | undefined> = {}
      for (const m of messages) {
        try {
          partsByMessage[m.id] = (await api.state.part(m.id)) as EngineTextPart[]
        } catch {
          partsByMessage[m.id] = undefined
        }
      }

      const turn = summarizeTurn(sessionID, messages, partsByMessage)
      if (!turn) return // turno sintético/subagente/sin prompt real

      const projectName = projectNameFromDirectory(session.directory)

      // Filtros configurables (umbral de duración, proyectos, patrones).
      if (
        !turnPassesFilters(turn, projectName, {
          minDurationMs: cfg.minDurationMs,
          ignoreProjects: cfg.ignoreProjects,
          ignorePromptPatterns: cfg.ignorePromptPatterns,
        })
      ) {
        return // turno filtrado: ni toast ni log (no marca dedup)
      }

      const key = dedupKey(sessionID, turn)
      if (isSeen(seen, key)) return
      seen = pushSeen(seen, key, SEEN_LIMIT)
      void persistSeen()

      const toast = formatRecallMessage({
        status: turn.status,
        promptText: turn.promptText,
        durationMs: turn.durationMs,
        projectName,
        showOriginalPrompt: cfg.showOriginalPrompt,
        showDuration: cfg.showDuration,
        showProject: cfg.showProject,
        maxPromptDisplayLength: cfg.maxPromptDisplayLength,
      })

      if (cfg.showGitBranch) {
        const branch = gitBranchFromDirectory(session.directory)
        if (branch) toast.message = `${toast.message}\n🌿 ${branch}`
      }

      // Evidencia SIEMPRE antes de renderizar (texto completo, sin truncar).
      void appendTurnLog(
        evidenceDir(),
        {
          at: new Date().toISOString(),
          sessionId: turn.sessionId,
          userMessageId: turn.userMessageId,
          assistantMessageId: turn.assistantMessageId,
          promptText: turn.promptText,
          promptLength: turn.promptLength,
          durationMs: turn.durationMs,
          status: turn.status,
          errorName: turn.errorName,
          project: session.directory ?? null,
        },
        cfg.logMaxBytes,
      )

      await api.ui.toast({
        variant: toast.variant,
        title: toast.title,
        message: toast.message,
        duration: cfg.toastDurationMs,
      })

      if (cfg.showNotifications) {
        try {
          await api.attention.notify({
            title: toast.title,
            message: toast.message,
            notification: true,
          })
        } catch {
          /* la notificación es best-effort */
        }
      }

      if (cfg.osNotifications) {
        notifyOs(process.platform, toast.title, toast.message)
      }
    } catch (err) {
      // Nunca romper la TUI por un fallo del plugin.
      try {
        await appendTurnLog(evidenceDir(), {
          at: new Date().toISOString(),
          level: "plugin-error",
          error: err instanceof Error ? err.message : String(err),
        })
      } catch {
        /* noop */
      }
    }
  }

  api.event.on("session.idle", onIdle)
}

export default { id: "kilo-task-recall", tui: KiloTaskRecall }

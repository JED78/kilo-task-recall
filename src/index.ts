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

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import type { TuiPluginApi } from "@kilocode/plugin/tui"

import {
  dedupKey,
  formatRecallMessage,
  isSeen,
  isSubagentSession,
  projectNameFromDirectory,
  pushSeen,
  summarizeTurn,
  type EngineMessage,
  type EngineTextPart,
} from "./recall-engine"

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
}

const DEFAULTS: Required<Omit<KiloTaskRecallOptions, never>> = {
  enabled: true,
  showOriginalPrompt: true,
  showDuration: true,
  showProject: true,
  showNotifications: false,
  maxPromptDisplayLength: 2000,
  toastDurationMs: 10000,
  logTurns: true,
  strictRouteMatch: true,
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
function belongsToThisTui(
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

async function appendTurnLog(
  dir: string,
  record: Record<string, unknown>,
): Promise<string | null> {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, "turns.jsonl")
    fs.appendFileSync(file, JSON.stringify(record) + "\n", "utf8")
    return file
  } catch {
    return null // el recordatorio nunca debe fallar por el log
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

      const key = dedupKey(sessionID, turn)
      if (isSeen(seen, key)) return
      seen = pushSeen(seen, key, SEEN_LIMIT)
      void persistSeen()

      const toast = formatRecallMessage({
        status: turn.status,
        promptText: turn.promptText,
        durationMs: turn.durationMs,
        projectName: projectNameFromDirectory(session.directory),
        showOriginalPrompt: cfg.showOriginalPrompt,
        showDuration: cfg.showDuration,
        showProject: cfg.showProject,
        maxPromptDisplayLength: cfg.maxPromptDisplayLength,
      })

      // Evidencia SIEMPRE antes de renderizar (texto completo, sin truncar).
      void appendTurnLog(evidenceDir(), {
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
      })

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

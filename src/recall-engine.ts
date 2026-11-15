/**
 * Kilo Task Recall — motor puro (sin dependencias del SDK de Kilo).
 *
 * Toda la lógica de decisión vive aquí para poder testearla con `node --test`
 * sin cargar el plugin en una TUI real. Los tipos locales replican, campo a
 * campo, los tipos verificados en @kilocode/sdk/dist/v2/gen/types.gen.d.ts
 * (Session, UserMessage, AssistantMessage, TextPart).
 *
 * Estados permitidos (nunca "TAREA COMPLETADA" sin evidencia):
 *   - RESPUESTA FINALIZADA (por defecto)
 *   - INTERRUMPIDA (AssistantMessage.error.name === "MessageAbortedError")
 *   - ERROR (cualquier otro error en AssistantMessage.error)
 */

export const STATUS_FINISHED = "RESPUESTA FINALIZADA"
export const STATUS_INTERRUPTED = "INTERRUMPIDA"
export const STATUS_ERROR = "ERROR"

export type RecallStatus =
  | typeof STATUS_FINISHED
  | typeof STATUS_INTERRUPTED
  | typeof STATUS_ERROR

export type ToastVariant = "info" | "success" | "warning" | "error"

/** Espejo de TextPart (campos relevantes). */
export interface EngineTextPart {
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
}

/** Espejo de UserMessage (campos relevantes). */
export interface EngineUserMessage {
  id: string
  role: "user"
  time: { created: number }
}

/** Espejo de AssistantMessage (campos relevantes). */
export interface EngineAssistantMessage {
  id: string
  role: "assistant"
  parentID?: string
  time: { created: number; completed?: number }
  error?: { name?: string } | null
}

export type EngineMessage = EngineUserMessage | EngineAssistantMessage

/** Resultado del análisis de un turno de conversación. */
export interface TurnSummary {
  sessionId: string
  userMessageId: string | null
  assistantMessageId: string | null
  promptText: string
  promptLength: number
  durationMs: number | null
  status: RecallStatus
  errorName: string | null
}

/** Una sesión con parentID definido es un subagente: se ignora. */
export function isSubagentSession(
  session: { parentID?: string | null } | null | undefined,
): boolean {
  return Boolean(session && session.parentID)
}

/**
 * Un UserMessage es "real" si tiene al menos un TextPart visible.
 * Los mensajes sintéticos (compresión DCP, "DCP | -644.6K removed...")
 * traen parts con synthetic/ignored y NO cuentan como prompt del usuario.
 * Sin información de parts se asume real (defensivo).
 */
export function isRealUserMessage(
  message: EngineMessage,
  parts: EngineTextPart[] | undefined,
): boolean {
  if (message.role !== "user") return false
  if (!parts) return true
  return visibleParts(parts).length > 0
}

/** TextParts visibles: tipo text, no synthetic, no ignored. */
export function visibleParts(parts: EngineTextPart[] | undefined): EngineTextPart[] {
  if (!parts) return []
  return parts.filter(
    (p) =>
      p &&
      p.type === "text" &&
      p.synthetic !== true &&
      p.ignored !== true &&
      typeof p.text === "string",
  )
}

/**
 * Texto del prompt del usuario: concatena los TextParts visibles con "\\n",
 * preservando multilínea y saltos internos. Nunca modifica el texto original.
 */
export function extractPromptText(parts: EngineTextPart[] | undefined): string {
  return visibleParts(parts)
    .map((p) => p.text)
    .join("\n")
}

/** Estado según el error del AssistantMessage (verificado en types.gen.d.ts). */
export function statusFromError(errorName: string | null | undefined): RecallStatus {
  if (!errorName) return STATUS_FINISHED
  if (errorName === "MessageAbortedError") return STATUS_INTERRUPTED
  return STATUS_ERROR
}

/**
 * Resume el ÚLTIMO turno real de la sesión:
 *  - último UserMessage real (los sintéticos se ignoran)
 *  - AssistantMessage asociado (por parentID; si no, el primero tras el user)
 *  - duración = assistant.time.completed - user.time.created (null si no hay completed)
 */
export function summarizeTurn(
  sessionId: string,
  messages: EngineMessage[],
  partsByMessage: Record<string, EngineTextPart[] | undefined>,
): TurnSummary | null {
  if (!Array.isArray(messages)) return null

  let userIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.role === "user" && isRealUserMessage(m, partsByMessage[m.id])) {
      userIdx = i
      break
    }
  }
  if (userIdx === -1) return null

  const user = messages[userIdx] as EngineUserMessage
  let assistant: EngineAssistantMessage | undefined
  let fallback: EngineAssistantMessage | undefined // primer assistant tras el user
  for (let i = userIdx + 1; i < messages.length; i++) {
    const m = messages[i]
    if (m && m.role === "assistant") {
      const a = m as EngineAssistantMessage
      if (a.parentID === user.id) {
        assistant = a
        break // match exacto por parentID
      }
      if (!fallback) fallback = a // sin parentID fiable: el primero tras el user
    }
  }
  if (!assistant) assistant = fallback

  const promptText = extractPromptText(partsByMessage[user.id])
  const errorName = assistant?.error?.name ?? null
  const completed = assistant?.time?.completed
  const durationMs =
    typeof completed === "number"
      ? Math.max(0, completed - user.time.created)
      : null

  return {
    sessionId,
    userMessageId: user.id,
    assistantMessageId: assistant?.id ?? null,
    promptText,
    promptLength: promptText.length,
    durationMs,
    status: statusFromError(errorName),
    errorName,
  }
}

/* ----------------------------- deduplicación ----------------------------- */

/** Clave de dedup: sesión + mensaje assistant (única por turno). */
export function dedupKey(
  sessionId: string,
  turn: Pick<TurnSummary, "assistantMessageId" | "userMessageId">,
): string {
  return `${sessionId}:${turn.assistantMessageId ?? turn.userMessageId ?? "unknown"}`
}

export function isSeen(seen: string[], key: string): boolean {
  return seen.includes(key)
}

/** Añade la clave y recorta el historial a `limit` entradas (FIFO). */
export function pushSeen(seen: string[], key: string, limit = 200): string[] {
  const next = seen.filter((k) => k !== key)
  next.push(key)
  return next.length > limit ? next.slice(next.length - limit) : next
}

/* ------------------------------ formateo -------------------------------- */

/** Trunca el texto SOLO para mostrar; el texto completo se guarda aparte. */
export function truncateText(text: string, max: number): string {
  if (!Number.isFinite(max) || max <= 0) return "(prompt oculto)"
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)) + "…"
}

/** Duración legible: 45s / 2m 05s / 1h 02m; null si se desconoce o es negativa. */
export function fmtDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return `${m}m ${String(rs).padStart(2, "0")}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, "0")}m`
}

/** Nombre de proyecto = última sección del directorio (acepta \\ y /). */
export function projectNameFromDirectory(dir: string | null | undefined): string | null {
  if (!dir) return null
  const norm = dir.replace(/[\\/]+$/, "")
  const parts = norm.split(/[\\/]/)
  const name = parts[parts.length - 1]
  return name || null
}

/* ------------------------ registro de evidencia (log) --------------------- */

/** Línea de `turns.jsonl` (turno real o error interno del plugin). */
export interface TurnRecord {
  at: string
  sessionId?: string
  userMessageId?: string | null
  assistantMessageId?: string | null
  promptText?: string
  promptLength?: number
  durationMs?: number | null
  status?: string
  errorName?: string | null
  project?: string | null
  level?: string
  error?: string
}

/** Parsea una línea del log; null si no es JSON válido u objeto. */
export function parseTurnLogLine(line: string): TurnRecord | null {
  try {
    const rec = JSON.parse(line) as unknown
    if (rec && typeof rec === "object" && !Array.isArray(rec)) {
      return rec as TurnRecord
    }
    return null
  } catch {
    return null
  }
}

/** ¿Es un registro de turno real (no un error interno del plugin)? */
export function isTurnRecord(rec: TurnRecord): boolean {
  return !rec.level && typeof rec.status === "string" && rec.status.length > 0
}

/* ------------------------------- filtros --------------------------------- */

export interface TurnFilterOptions {
  /** Duración mínima del turno en ms (menores se ignoran). */
  minDurationMs?: number | null
  /** Nombres de proyecto (última sección del directorio) a silenciar. */
  ignoreProjects?: string[] | null
  /** Patrones (código fuente de regex) que silencian por texto del prompt. */
  ignorePromptPatterns?: string[] | null
}

/**
 * Decisión de mostrar un turno en la TUI según los filtros configurados.
 * Pura: recibe el resumen del turno y el nombre de proyecto ya calculado.
 */
export function turnPassesFilters(
  turn: Pick<TurnSummary, "durationMs" | "promptText">,
  projectName: string | null,
  opts: TurnFilterOptions,
): boolean {
  if (opts.minDurationMs !== null && opts.minDurationMs !== undefined) {
    if (turn.durationMs !== null && turn.durationMs < opts.minDurationMs) return false
  }
  if (opts.ignoreProjects && projectName !== null) {
    for (const p of opts.ignoreProjects) {
      if (p && p.toLowerCase() === projectName.toLowerCase()) return false
    }
  }
  if (opts.ignorePromptPatterns) {
    for (const src of opts.ignorePromptPatterns) {
      try {
        if (new RegExp(src).test(turn.promptText)) return false
      } catch {
        /* patrón inválido: se ignora el filtro, nunca el turno */
      }
    }
  }
  return true
}

/* ------------------------------ estadísticas ------------------------------ */

export interface ProjectStat {
  project: string
  turns: number
  finished: number
  interrupted: number
  errors: number
  totalDurationMs: number
}

export interface TurnStats {
  total: number
  finished: number
  interrupted: number
  errors: number
  totalDurationMs: number
  avgDurationMs: number | null
  sessions: number
  byProject: ProjectStat[]
}

/** Fecha local como YYYY-MM-DD (los logs se agrupan por día local). */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** ¿El registro `at` (ISO) cae dentro del día local indicado (YYYY-MM-DD)? */
export function isSameLocalDay(iso: string, day: string): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return toLocalDateString(d) === day
}

/**
 * Filtra registros de turno por día local, proyecto (nombre o coincidencia
 * en la ruta) y estado. Los errores internos (level) siempre se excluyen.
 */
export function filterTurnRecords(
  records: TurnRecord[],
  opts: { day?: string | null; project?: string | null; status?: string | null } = {},
): TurnRecord[] {
  let out = records.filter(isTurnRecord)
  if (opts.day) out = out.filter((r) => isSameLocalDay(r.at, opts.day as string))
  if (opts.project) {
    const needle = opts.project.toLowerCase()
    out = out.filter((r) => {
      const dir = r.project ?? ""
      const name = projectNameFromDirectory(dir)
      return (name !== null && name.toLowerCase() === needle) || dir.toLowerCase().includes(needle)
    })
  }
  if (opts.status) out = out.filter((r) => r.status === opts.status)
  return out
}

/** Agrega estadísticas (productividad: completados vs interrumpidos/errores). */
export function computeTurnStats(records: TurnRecord[]): TurnStats {
  const turns = records.filter(isTurnRecord)
  const stats: TurnStats = {
    total: turns.length,
    finished: 0,
    interrupted: 0,
    errors: 0,
    totalDurationMs: 0,
    avgDurationMs: null,
    sessions: 0,
    byProject: [],
  }
  const byProject = new Map<string, ProjectStat>()
  const sessions = new Set<string>()
  let durationCount = 0

  for (const r of turns) {
    if (r.status === STATUS_FINISHED) stats.finished++
    else if (r.status === STATUS_INTERRUPTED) stats.interrupted++
    else if (r.status === STATUS_ERROR) stats.errors++

    if (typeof r.durationMs === "number" && Number.isFinite(r.durationMs) && r.durationMs >= 0) {
      stats.totalDurationMs += r.durationMs
      durationCount++
    }
    if (r.sessionId) sessions.add(r.sessionId)

    const key = projectNameFromDirectory(r.project) ?? "(sin proyecto)"
    let ps = byProject.get(key)
    if (!ps) {
      ps = { project: key, turns: 0, finished: 0, interrupted: 0, errors: 0, totalDurationMs: 0 }
      byProject.set(key, ps)
    }
    ps.turns++
    if (r.status === STATUS_FINISHED) ps.finished++
    else if (r.status === STATUS_INTERRUPTED) ps.interrupted++
    else if (r.status === STATUS_ERROR) ps.errors++
    if (typeof r.durationMs === "number" && Number.isFinite(r.durationMs) && r.durationMs >= 0) {
      ps.totalDurationMs += r.durationMs
    }
  }

  if (durationCount > 0) stats.avgDurationMs = Math.round(stats.totalDurationMs / durationCount)
  stats.sessions = sessions.size
  stats.byProject = [...byProject.values()].sort((a, b) => b.turns - a.turns)
  return stats
}

/* --------------------------------- CSV ----------------------------------- */

/** Escape CSV estándar: comillas dobladas, campo entre comillas si hace falta. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Serializa registros de turno a CSV (at,sessionId,status,durationMs,project,promptText). */
export function turnsToCsv(records: TurnRecord[]): string {
  const header = "at,sessionId,status,durationMs,project,promptText"
  const rows = records
    .filter(isTurnRecord)
    .map((r) =>
      [
        r.at ?? "",
        r.sessionId ?? "",
        r.status ?? "",
        typeof r.durationMs === "number" ? String(r.durationMs) : "",
        r.project ?? "",
        (r.promptText ?? "").replace(/\r?\n/g, "\\n"),
      ]
        .map(csvField)
        .join(","),
    )
  return [header, ...rows].join("\n") + "\n"
}

/* ------------------------------ rama de git ------------------------------- */

/**
 * Extrae la rama del contenido de `.git/HEAD` (ref: refs/heads/<rama>).
 * Pura: solo interpreta texto; la lectura del fichero vive en index.ts.
 */
export function parseGitHead(content: string | null | undefined): string | null {
  if (!content) return null
  const m = content.match(/^ref:\s*refs\/heads\/([^\s\r\n]+)/)
  return m ? m[1] : null
}

/* --------------------------- notificación del OS --------------------------- */

export interface OsNotifyCommand {
  cmd: string
  args: string[]
}

/**
 * Construye (sin ejecutar) el comando de notificación del sistema para la
 * plataforma dada. null si la plataforma no está soportada. Pura y testeable:
 * index.ts solo la ejecuta de forma best-effort con child_process.spawn.
 */
export function buildOsNotifyCommand(
  platform: string,
  title: string,
  message: string,
): OsNotifyCommand | null {
  const singleQuoteEscape = (s: string) => s.replace(/'/g, "''").replace(/\r?\n/g, " ")
  switch (platform) {
    case "win32": {
      const script =
        "$t='" +
        singleQuoteEscape(title) +
        "'; $m='" +
        singleQuoteEscape(message) +
        "'; Add-Type -AssemblyName System.Windows.Forms; " +
        "$n=New-Object System.Windows.Forms.NotifyIcon; " +
        "$n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; " +
        "$n.ShowBalloonTip(10000,$t,$m,'Info')"
      return { cmd: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", script] }
    }
    case "linux":
      return { cmd: "notify-send", args: [title, message] }
    case "darwin":
      return {
        cmd: "osascript",
        args: [
          "-e",
          `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
        ],
      }
    default:
      return null
  }
}

/* ---------------------------- rotación del log ---------------------------- */

/** Nombre del fichero de archivo del log para un día local YYYY-MM-DD. */
export function archiveLogName(dayLocal: string): string {
  return `turns-${dayLocal}.jsonl`
}

/** ¿Toca rotar el log? (maxBytes <= 0 significa sin rotación). */
export function shouldRotateLog(sizeBytes: number, maxBytes: number): boolean {
  if (maxBytes <= 0) return false
  return sizeBytes >= maxBytes
}

export interface RecallFormatOptions {
  status: RecallStatus
  promptText: string
  durationMs: number | null
  projectName: string | null
  showOriginalPrompt?: boolean
  showDuration?: boolean
  showProject?: boolean
  maxPromptDisplayLength?: number
}

export interface RecallToast {
  title: string
  message: string
  variant: ToastVariant
}

/** Construye el toast según el estado (success/info/warning/error). */
export function formatRecallMessage(opts: RecallFormatOptions): RecallToast {
  const {
    status,
    promptText,
    durationMs,
    projectName,
    showOriginalPrompt = true,
    showDuration = true,
    showProject = true,
    maxPromptDisplayLength = 2000,
  } = opts

  const variant: ToastVariant =
    status === STATUS_ERROR ? "error" : status === STATUS_INTERRUPTED ? "warning" : "info"

  const lines: string[] = []
  if (showOriginalPrompt) lines.push(truncateText(promptText, maxPromptDisplayLength))

  const meta: string[] = []
  if (showDuration) {
    const d = fmtDuration(durationMs)
    if (d) meta.push(`⏱ ${d}`)
  }
  if (showProject && projectName) meta.push(`📁 ${projectName}`)
  if (meta.length > 0) lines.push(meta.join("  "))

  return {
    title: `Kilo Task Recall · ${status}`,
    message: lines.join("\n"),
    variant,
  }
}

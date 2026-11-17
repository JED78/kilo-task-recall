/**
 * CLI de consulta para la evidencia de kilo-task-recall.
 *
 * Lee `%LOCALAPPDATA%\kilo-task-recall\turns.jsonl` (o --file) y responde:
 *   node src/cli.ts --today                  # resumen del día (humano)
 *   node src/cli.ts --stats                  # estadísticas de TODO el log
 *   node src/cli.ts --project kilo-task-recall --today
 *   node src/cli.ts --csv [--today] [--project X] > turns.csv
 *   node src/cli.ts --last                   # último prompt (reutilizar)
 *   node src/cli.ts --last --clip            # …y lo copia al portapapeles
 *
 * Cero dependencias de terceros. El motor es puro (src/recall-engine.ts).
 */

import * as childProcess from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import process from "node:process"

import { evidenceDir } from "./index.ts"
import {
  computeTurnStats,
  filterTurnRecords,
  fmtDuration,
  parseTurnLogLine,
  toLocalDateString,
  turnsToCsv,
  type TurnRecord,
} from "./recall-engine.ts"

interface CliArgs {
  file?: string
  today?: boolean
  stats?: boolean
  project?: string
  status?: string
  csv?: boolean
  last?: boolean
  clip?: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--file") args.file = argv[++i]
    else if (a === "--today") args.today = true
    else if (a === "--stats") args.stats = true
    else if (a === "--project") args.project = argv[++i]
    else if (a === "--status") args.status = argv[++i]
    else if (a === "--csv") args.csv = true
    else if (a === "--last") args.last = true
    else if (a === "--clip") args.clip = true
  }
  return args
}

/** Lee y parsea todas las líneas válidas del fichero de evidencia. */
export function readTurnRecords(file: string): TurnRecord[] {
  let raw: string
  try {
    raw = fs.readFileSync(file, "utf8")
  } catch {
    return []
  }
  const out: TurnRecord[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const rec = parseTurnLogLine(line)
    if (rec) out.push(rec)
  }
  return out
}

/** Copia texto al portapapeles del SO (best-effort); devuelve el comando usado. */
export function copyToClipboard(text: string): string | null {
  const platform = process.platform
  try {
    if (platform === "win32") {
      const c = childProcess.spawn("clip.exe", { stdio: ["pipe", "ignore", "ignore"] })
      c.stdin.write(text, "utf8")
      c.stdin.end()
      return "clip.exe"
    }
    if (platform === "darwin") {
      childProcess.execFileSync("pbcopy", [], { input: text, encoding: "utf8" })
      return "pbcopy"
    }
    if (platform === "linux") {
      childProcess.execFileSync("wl-copy", [], { input: text, encoding: "utf8" })
      return "wl-copy"
    }
  } catch {
    /* portapapeles no disponible: best-effort */
  }
  return null
}

function fmtStatsHuman(file: string, day: string | null, records: TurnRecord[]): string {
  const st = computeTurnStats(records)
  const head = day
    ? `Resumen ${day} (${path.basename(file)})`
    : `Estadísticas (${path.basename(file)})`
  const lines = [
    head,
    `  Turnos: ${st.total}  (FINALIZADA ${st.finished} · INTERRUMPIDA ${st.interrupted} · ERROR ${st.errors})`,
    `  Duración total: ${fmtDuration(st.totalDurationMs) ?? "?"}  media: ${fmtDuration(st.avgDurationMs) ?? "?"}`,
    `  Sesiones distintas: ${st.sessions}`,
  ]
  if (st.byProject.length > 0) {
    lines.push("  Por proyecto:")
    for (const p of st.byProject) {
      lines.push(
        `    ${p.project}: ${p.turns} turnos (${p.finished} ok, ${p.interrupted} interr., ${p.errors} err., ${fmtDuration(p.totalDurationMs) ?? "?"})`,
      )
    }
  }
  return lines.join("\n")
}

/** Punto de entrada del CLI; separado de main() para poder testearlo. */
export function main(argv: string[]): number {
  const args = parseArgs(argv)
  const file = args.file ?? path.join(evidenceDir(), "turns.jsonl")
  const all = readTurnRecords(file)
  const day = args.today ? toLocalDateString(new Date()) : null
  const selected = filterTurnRecords(all, {
    day,
    project: args.project ?? null,
    status: args.status ?? null,
  })

  if (args.last) {
    const last = selected[selected.length - 1] ?? all[all.length - 1]
    if (!last || !last.promptText) {
      process.stderr.write("Sin prompts registrados todavía.\n")
      return 1
    }
    process.stdout.write(last.promptText + "\n")
    if (args.clip) {
      const via = copyToClipboard(last.promptText)
      process.stderr.write(
        via ? `Copiado al portapapeles vía ${via}\n` : "Portapapeles no disponible en esta plataforma.\n",
      )
    }
    return 0
  }

  if (args.csv) {
    process.stdout.write(turnsToCsv(selected))
    return 0
  }

  process.stdout.write(fmtStatsHuman(file, day, selected) + "\n")
  return 0
}

/* Ejecución como script: node src/cli.ts ... */
const invokedDirectly = (() => {
  const arg1 = process.argv[1]
  if (!arg1) return false
  try {
    return path.resolve(arg1) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)))
}

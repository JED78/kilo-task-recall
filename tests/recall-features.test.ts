/**
 * Pruebas unitarias de las extensiones de Kilo Task Recall:
 * filtros, estadísticas, CSV, rama git, notificación OS y rotación del log.
 * Ejecutar: npm test  (node --test, Node >= 22.6 con type stripping nativo)
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import { gitBranchFromDirectory, rotateLogIfNeeded } from "../src/index.ts"
import {
  STATUS_ERROR,
  STATUS_FINISHED,
  STATUS_INTERRUPTED,
  archiveLogName,
  buildOsNotifyCommand,
  computeTurnStats,
  filterTurnRecords,
  isSameLocalDay,
  isTurnRecord,
  parseGitHead,
  parseTurnLogLine,
  shouldRotateLog,
  toLocalDateString,
  turnPassesFilters,
  turnsToCsv,
  type TurnRecord,
} from "../src/recall-engine.ts"

/* ----------------------------- fixtures ---------------------------------- */

function turnRec(overrides: Partial<TurnRecord>): TurnRecord {
  return {
    at: "2026-11-15T10:00:00.000Z",
    sessionId: "s1",
    promptText: "tarea de prueba",
    promptLength: 15,
    durationMs: 5000,
    status: STATUS_FINISHED,
    project: "Z:/proyectos/demo",
    ...overrides,
  }
}

/* ---------------------- parseo del log de evidencia ----------------------- */

test("T-B1: parseTurnLogLine acepta JSON de objeto y rechaza el resto", () => {
  assert.ok(parseTurnLogLine('{"at":"2026-11-15T10:00:00.000Z","status":"RESPUESTA FINALIZADA"}'))
  assert.equal(parseTurnLogLine("no es json"), null)
  assert.equal(parseTurnLogLine("[1,2]"), null) // array → no es un registro
  assert.equal(parseTurnLogLine("42"), null)
})

test("T-B2: isTurnRecord distingue turnos reales de errores internos", () => {
  assert.equal(isTurnRecord(turnRec({})), true)
  assert.equal(isTurnRecord(turnRec({ level: "plugin-error", status: undefined })), false)
})

/* ------------------------------- filtros --------------------------------- */

test("T-B3: turnPassesFilters respeta minDurationMs", () => {
  const base = { durationMs: 4000 as number | null, promptText: "hola" }
  assert.equal(turnPassesFilters(base, "demo", { minDurationMs: 5000 }), false)
  assert.equal(turnPassesFilters(base, "demo", { minDurationMs: 4000 }), true)
  // Sin duración conocida (null) no se filtra por umbral.
  assert.equal(turnPassesFilters({ ...base, durationMs: null }, "demo", { minDurationMs: 99999 }), true)
})

test("T-B4: turnPassesFilters ignora proyectos sin distinguir mayúsculas", () => {
  assert.equal(turnPassesFilters({ durationMs: null, promptText: "x" }, "Demo", { ignoreProjects: ["demo"] }), false)
  assert.equal(turnPassesFilters({ durationMs: null, promptText: "x" }, "otro", { ignoreProjects: ["demo"] }), true)
})

test("T-B5: turnPassesFilters aplica patrones de prompt y tolera regex inválidos", () => {
  const t = { durationMs: null, promptText: "git push origin master" }
  assert.equal(turnPassesFilters(t, null, { ignorePromptPatterns: ["^git push"] }), false)
  assert.equal(turnPassesFilters(t, null, { ignorePromptPatterns: ["[invalid"] }), true)
})

/* ---------------------- día local y filtrado de log ---------------------- */

test("T-B6: toLocalDateString e isSameLocalDay", () => {
  assert.equal(toLocalDateString(new Date(2026, 10, 15, 23, 59)), "2026-11-15")
  const d = new Date(2026, 10, 15, 12, 0)
  const iso = d.toISOString()
  assert.equal(isSameLocalDay(iso, "2026-11-15"), true)
  assert.equal(isSameLocalDay("no-iso", "2026-11-15"), false)
})

test("T-B7: filterTurnRecords filtra por día, proyecto, estado y excluye errores", () => {
  const records: TurnRecord[] = [
    turnRec({ at: "2026-11-14T10:00:00.000Z" }),
    turnRec({ at: "2026-11-15T10:00:00.000Z", status: STATUS_INTERRUPTED }),
    turnRec({ at: "2026-11-15T11:00:00.000Z", project: "Z:/proyectos/otro" }),
    turnRec({ level: "plugin-error", error: "boom", status: undefined }),
  ]
  const today = filterTurnRecords(records, { day: "2026-11-15" })
  assert.equal(today.length, 2)

  const demo = filterTurnRecords(records, { project: "demo" })
  assert.equal(demo.length, 2) // dos registros del proyecto demo (14 y 15 nov)

  const interrupted = filterTurnRecords(records, { status: STATUS_INTERRUPTED })
  assert.equal(interrupted.length, 1)

  // Los registros con level (errores internos) nunca entran en los filtros.
  const all = filterTurnRecords(records, {})
  assert.equal(all.length, 3)
})

/* ---------------------------- estadísticas ------------------------------- */

test("T-B8: computeTurnStats agrega totales, media, sesiones y por proyecto", () => {
  const records: TurnRecord[] = [
    turnRec({ sessionId: "s1", durationMs: 1000, status: STATUS_FINISHED, project: "P:/a" }),
    turnRec({ sessionId: "s2", durationMs: 3000, status: STATUS_INTERRUPTED, project: "P:/a" }),
    turnRec({ sessionId: "s2", durationMs: null, status: STATUS_ERROR, project: "P:/b" }),
    turnRec({ level: "plugin-error", error: "x", status: undefined }),
  ]
  const st = computeTurnStats(records)
  assert.equal(st.total, 3)
  assert.equal(st.finished, 1)
  assert.equal(st.interrupted, 1)
  assert.equal(st.errors, 1)
  assert.equal(st.avgDurationMs, 2000)
  assert.equal(st.sessions, 2)
  assert.equal(st.byProject.length, 2)
  const a = st.byProject.find((p) => p.project === "a")
  assert.ok(a)
  assert.equal(a.turns, 2)
  assert.equal(a.finished, 1)
  assert.equal(a.interrupted, 1)
  assert.equal(a.totalDurationMs, 4000)
})

/* -------------------------------- CSV ------------------------------------ */

test("T-B9: turnsToCsv produce cabecera, filas y escapado estándar", () => {
  const csv = turnsToCsv([
    turnRec({ promptText: 'dijo "hola", dos veces' }),
    turnRec({ level: "plugin-error", error: "x", status: undefined }),
  ])
  const lines = csv.trimEnd().split("\n")
  assert.equal(lines[0], "at,sessionId,status,durationMs,project,promptText")
  assert.equal(lines.length, 2) // solo el turno real; plugin-error fuera
  assert.match(lines[1], /""hola"", dos veces/)
})

/* ------------------------------ rama git --------------------------------- */

test("T-B10: parseGitHead extrae la rama de .git/HEAD", () => {
  assert.equal(parseGitHead("ref: refs/heads/master\n"), "master")
  assert.equal(parseGitHead("ref: refs/heads/feature/bench\r\n"), "feature/bench")
  assert.equal(parseGitHead("e3b0c44298fc1c149afbf4c8996fb92427ae41e4"), null)
  assert.equal(parseGitHead(null), null)
})

test("T-B11: gitBranchFromDirectory lee el HEAD de este repo y falla en silencio", () => {
  const here = process.cwd()
  const branch = gitBranchFromDirectory(here)
  assert.ok(branch && branch.length > 0, "este proyecto es un repo git: debe devolver una rama")
  assert.equal(gitBranchFromDirectory(path.join(os.tmpdir(), "no-existe-ktr")), null)
  assert.equal(gitBranchFromDirectory(null), null)
})

/* --------------------------- notificación OS ----------------------------- */

test("T-B12: buildOsNotifyCommand soporta win32/linux/darwin y null en otras", () => {
  const win = buildOsNotifyCommand("win32", "Kilo Task Recall", "título con 'comillas'")
  assert.ok(win)
  assert.equal(win.cmd, "powershell.exe")
  assert.match(win.args[3], /ShowBalloonTip/)
  assert.match(win.args[3], /''comillas''/) // comilla simple doblada
  assert.equal(win.args[3].includes("\n"), false) // saltos de línea aplanados

  const linux = buildOsNotifyCommand("linux", "t", "m")
  assert.deepEqual(linux, { cmd: "notify-send", args: ["t", "m"] })

  const mac = buildOsNotifyCommand("darwin", "t", "m")
  assert.ok(mac)
  assert.equal(mac.cmd, "osascript")
  assert.match(mac.args[1], /display notification "m" with title "t"/)

  assert.equal(buildOsNotifyCommand("freebsd", "t", "m"), null)
})

/* ---------------------------- rotación del log --------------------------- */

test("T-B13: archiveLogName y shouldRotateLog", () => {
  assert.equal(archiveLogName("2026-11-15"), "turns-2026-11-15.jsonl")
  assert.equal(shouldRotateLog(5 * 1024 * 1024, 5 * 1024 * 1024), true)
  assert.equal(shouldRotateLog(1024, 5 * 1024 * 1024), false)
  assert.equal(shouldRotateLog(99999999, 0), false) // sin rotación
})

test("T-B14: rotateLogIfNeeded mueve turns.jsonl a su archivo por día", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ktr-rot-"))
  const file = path.join(dir, "turns.jsonl")
  fs.writeFileSync(file, "x".repeat(1000), "utf8")

  // Por debajo del límite: no rota.
  rotateLogIfNeeded(dir, 10000)
  assert.ok(fs.existsSync(file))

  // Supera el límite: rota a turns-<día>.jsonl.
  rotateLogIfNeeded(dir, 500)
  assert.equal(fs.existsSync(file), false)
  const moved = fs.readdirSync(dir).find((f) => f.startsWith("turns-") && f.endsWith(".jsonl"))
  assert.ok(moved, "debe existir el archivo de rotación")
  assert.equal(fs.statSync(path.join(dir, moved)).size, 1000)

  // Rotar de nuevo el mismo día no sobreescribe: crea variante con sufijo.
  fs.writeFileSync(file, "y".repeat(1000), "utf8")
  rotateLogIfNeeded(dir, 500)
  const variants = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
  assert.equal(variants.length, 2)
})

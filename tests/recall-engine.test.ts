/**
 * Pruebas unitarias del motor puro de Kilo Task Recall.
 * Ejecutar: npm test  (node --test, Node >= 22.6 con type stripping nativo)
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import * as nodePath from "node:path"

import { belongsToThisTui, evidenceDir } from "../src/index.ts"
import {
  STATUS_ERROR,
  STATUS_FINISHED,
  STATUS_INTERRUPTED,
  dedupKey,
  extractPromptText,
  fmtDuration,
  formatRecallMessage,
  isRealUserMessage,
  isSeen,
  isSubagentSession,
  projectNameFromDirectory,
  pushSeen,
  statusFromError,
  summarizeTurn,
  truncateText,
  visibleParts,
  type EngineAssistantMessage,
  type EngineMessage,
  type EngineTextPart,
  type EngineUserMessage,
} from "../src/recall-engine.ts"

function user(id: string, created: number): EngineUserMessage {
  return { id, role: "user", time: { created } }
}

function assistant(
  id: string,
  parentID: string,
  created: number,
  completed?: number,
  error?: { name?: string } | null,
): EngineAssistantMessage {
  return { id, role: "assistant", parentID, time: { created, completed }, error }
}

function parts(...texts: string[]): EngineTextPart[] {
  return texts.map((text) => ({ type: "text" as const, text }))
}

test("T-A1: turno sencillo → estado por defecto RESPUESTA FINALIZADA", () => {
  const msgs: EngineMessage[] = [
    user("u1", 1000),
    assistant("a1", "u1", 2000, 5000),
  ]
  const partsMap = { u1: parts("haz un hola mundo") }
  const turn = summarizeTurn("s1", msgs, partsMap)
  assert.ok(turn)
  assert.equal(turn.promptText, "haz un hola mundo")
  assert.equal(turn.status, STATUS_FINISHED)
  assert.equal(turn.durationMs, 4000)
  assert.equal(turn.userMessageId, "u1")
  assert.equal(turn.assistantMessageId, "a1")
})

test("T-A2: prompt multilínea se preserva íntegro", () => {
  const partsMap = { u1: parts("línea 1\nlínea 2", "línea 3") }
  const msgs: EngineMessage[] = [user("u1", 0), assistant("a1", "u1", 0)]
  const turn = summarizeTurn("s1", msgs, partsMap)
  assert.equal(turn?.promptText, "línea 1\nlínea 2\nlínea 3")
  // extractPromptText directo también
  assert.equal(extractPromptText(partsMap.u1), "línea 1\nlínea 2\nlínea 3")
})

test("T-A3: tres prompts consecutivos → siempre el ÚLTIMO turno", () => {
  const msgs: EngineMessage[] = [
    user("u1", 0),
    assistant("a1", "u1", 0, 100),
    user("u2", 100),
    assistant("a2", "u2", 100, 200),
    user("u3", 200),
    assistant("a3", "u3", 200, 300),
  ]
  const partsMap = {
    u1: parts("uno"),
    u2: parts("dos"),
    u3: parts("tres"),
  }
  const turn = summarizeTurn("s1", msgs, partsMap)
  assert.equal(turn?.promptText, "tres")
  assert.equal(turn?.assistantMessageId, "a3")
  assert.equal(turn?.durationMs, 100)
})

test("T-A4: mensajes sintéticos de compresión NO son prompts del usuario", () => {
  const syntheticParts: EngineTextPart[] = [
    { type: "text", synthetic: true, text: "DCP | -644.6K removed..." },
  ]
  assert.equal(isRealUserMessage(user("u1", 0), syntheticParts), false)
  assert.equal(extractPromptText(syntheticParts), "")
  assert.equal(visibleParts(syntheticParts).length, 0)

  // turno compuesto solo por un user sintético + assistant → null (no toast)
  const msgs: EngineMessage[] = [user("u1", 0), assistant("a1", "u1", 0, 10)]
  assert.equal(summarizeTurn("s1", msgs, { u1: syntheticParts }), null)
})

test("T-A5: session con parentID = subagente → isSubagentSession true", () => {
  assert.equal(isSubagentSession({ id: "s1", parentID: "ses_padre" }), true)
  assert.equal(isSubagentSession({ id: "s1" }), false)
  assert.equal(isSubagentSession(null), false)
})

test("T-A6: duración null si assistant no tiene completed; fallback seguro", () => {
  const msgs: EngineMessage[] = [user("u1", 1000), assistant("a1", "u1", 2000)]
  const turn = summarizeTurn("s1", msgs, { u1: parts("x") })
  assert.equal(turn?.durationMs, null)
  assert.equal(turn?.status, STATUS_FINISHED)
})

test("T-A7: MessageAbortedError → INTERRUMPIDA; otros errores → ERROR", () => {
  assert.equal(statusFromError(null), STATUS_FINISHED)
  assert.equal(statusFromError(undefined), STATUS_FINISHED)
  assert.equal(statusFromError("MessageAbortedError"), STATUS_INTERRUPTED)
  assert.equal(statusFromError("UnknownError"), STATUS_ERROR)
  assert.equal(statusFromError("ProviderAuthError"), STATUS_ERROR)

  const msgs: EngineMessage[] = [
    user("u1", 0),
    assistant("a1", "u1", 0, 10, { name: "MessageAbortedError" }),
  ]
  const turn = summarizeTurn("s1", msgs, { u1: parts("x") })
  assert.equal(turn?.status, STATUS_INTERRUPTED)
})

test("T-A8: truncado para mostrar (2000 default) no altera el almacenado", () => {
  const long = "a".repeat(2500)
  assert.equal(truncateText(long, 2000).length, 2000)
  assert.ok(truncateText(long, 2000).endsWith("…"))
  assert.equal(truncateText("corto", 2000), "corto")
  assert.equal(truncateText("x", 0), "(prompt oculto)")

  const toast = formatRecallMessage({
    status: STATUS_FINISHED,
    promptText: long,
    durationMs: 1000,
    projectName: "p",
    maxPromptDisplayLength: 100,
  })
  assert.ok(toast.message.split("\n")[0].length <= 100)
  assert.ok(long.startsWith(toast.message.split("\n")[0].slice(0, -1)))
})

test("T-A9: dedup por (sessionID + assistantMessageID)", () => {
  const k1 = dedupKey("s1", { assistantMessageId: "a1", userMessageId: "u1" })
  const k2 = dedupKey("s1", { assistantMessageId: "a2", userMessageId: "u2" })
  const k3 = dedupKey("s2", { assistantMessageId: "a1", userMessageId: "u1" })
  assert.notEqual(k1, k2)
  assert.notEqual(k1, k3)

  let seen: string[] = []
  assert.equal(isSeen(seen, k1), false)
  seen = pushSeen(seen, k1)
  assert.equal(isSeen(seen, k1), true)
  // límite FIFO
  for (let i = 0; i < 250; i++) seen = pushSeen(seen, `k${i}`, 200)
  assert.equal(seen.length, 200)
  assert.equal(isSeen(seen, k1), false) // desalojada
})

test("T-A10: formato del toast (duración y proyecto)", () => {
  const t1 = formatRecallMessage({
    status: STATUS_FINISHED,
    promptText: "hola",
    durationMs: 125000,
    projectName: "mi-proyecto",
  })
  assert.equal(t1.title, "Kilo Task Recall · RESPUESTA FINALIZADA")
  assert.equal(t1.variant, "info")
  assert.ok(t1.message.includes("⏱ 2m 05s"))
  assert.ok(t1.message.includes("📁 mi-proyecto"))

  const t2 = formatRecallMessage({
    status: STATUS_INTERRUPTED,
    promptText: "x",
    durationMs: null,
    projectName: null,
  })
  assert.equal(t2.variant, "warning")
  assert.ok(!t2.message.includes("⏱"))

  const t3 = formatRecallMessage({
    status: STATUS_ERROR,
    promptText: "x",
    durationMs: 0,
    projectName: "p",
    showProject: false,
  })
  assert.equal(t3.variant, "error")
  assert.ok(!t3.message.includes("📁"))

  const t4 = formatRecallMessage({
    status: STATUS_FINISHED,
    promptText: "x",
    durationMs: null,
    projectName: "p",
    showOriginalPrompt: false,
  })
  assert.ok(!t4.message.includes("x"))
})

test("T-A11: fmtDuration", () => {
  assert.equal(fmtDuration(null), null)
  assert.equal(fmtDuration(0), "0s")
  assert.equal(fmtDuration(45000), "45s")
  assert.equal(fmtDuration(125000), "2m 05s")
  assert.equal(fmtDuration(3720000), "1h 02m")
})

test("T-A12: projectNameFromDirectory acepta barras Windows y Unix", () => {
  assert.equal(projectNameFromDirectory("C:\\Users\\delac\\proyectosIA\\mi-app"), "mi-app")
  assert.equal(projectNameFromDirectory("/home/delac/proyectosIA/mi-app/"), "mi-app")
  assert.equal(projectNameFromDirectory(""), null)
  assert.equal(projectNameFromDirectory(undefined), null)
})

test("T-A13: sin user real en la sesión → null", () => {
  const msgs: EngineMessage[] = [assistant("a1", "u0", 0, 10)]
  assert.equal(summarizeTurn("s1", msgs, {}), null)
  assert.equal(summarizeTurn("s1", [], {}), null)
  assert.equal(summarizeTurn("s1", undefined as unknown as EngineMessage[], {}), null)
})

test("T-A14: assistant matcheado por parentID aunque haya otros assistants", () => {
  const msgs: EngineMessage[] = [
    user("u1", 0),
    assistant("a_otro", "uX", 0, 50), // de otro turno/subagente
    assistant("a1", "u1", 0, 100), // el correcto
  ]
  const turn = summarizeTurn("s1", msgs, { u1: parts("p") })
  assert.equal(turn?.assistantMessageId, "a1")
})

test("T-A15 (RF-10): pertenencia multi-terminal por route/directorio", () => {
  const session = { id: "s1", directory: "C:\\repo\\mi-app" }

  // route "session": coincide el sessionID del evento con el de la sesión
  assert.equal(
    belongsToThisTui(session, { name: "session", params: { sessionID: "s1" } }, "C:\\otra", true),
    true,
  )
  assert.equal(
    belongsToThisTui(session, { name: "session", params: { sessionID: "s2" } }, "C:\\repo\\mi-app", true),
    false,
  )

  // route "home": compara directorio de sesión vs directorio de trabajo (case/trailing slash)
  assert.equal(belongsToThisTui(session, { name: "home" }, "c:\\repo\\mi-app\\", true), true)
  assert.equal(belongsToThisTui(session, { name: "home" }, "C:\\otra\\ruta", true), false)
  assert.equal(belongsToThisTui(session, { name: "home" }, undefined, true), false)
  assert.equal(belongsToThisTui(undefined, { name: "home" }, "C:\\repo\\mi-app", true), false)

  // ruta desconocida o sin datos → no pertenece (modo estricto)
  assert.equal(belongsToThisTui(session, undefined, "C:\\repo\\mi-app", true), false)

  // strictRouteMatch=false → siempre pertenece
  assert.equal(belongsToThisTui(session, undefined, undefined, false), true)
})

test("T-A16 (RF-15): evidenceDir usa LOCALAPPDATA, con fallback a HOME", () => {
  const prevLocal = process.env.LOCALAPPDATA
  const prevHome = process.env.HOME
  try {
    process.env.LOCALAPPDATA = "C:\\Users\\delac\\AppData\\Local"
    assert.equal(evidenceDir(), nodePath.join("C:\\Users\\delac\\AppData\\Local", "kilo-task-recall"))

    delete process.env.LOCALAPPDATA
    process.env.HOME = "/home/delac"
    assert.equal(evidenceDir(), nodePath.join("/home/delac", ".local", "share", "kilo-task-recall"))

    delete process.env.HOME
    assert.ok(evidenceDir().endsWith(nodePath.join("kilo-task-recall"))) // último recurso: tmpdir
  } finally {
    if (prevLocal !== undefined) process.env.LOCALAPPDATA = prevLocal
    else delete process.env.LOCALAPPDATA
    if (prevHome !== undefined) process.env.HOME = prevHome
    else delete process.env.HOME
  }
})

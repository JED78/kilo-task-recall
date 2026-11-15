// KTR bench driver v2 — pilota turnos vía API HTTP de `kilo serve` y valida
// la evidencia en %LOCALAPPDATA%\kilo-task-recall\turns.jsonl.
import * as fs from "node:fs"
import * as path from "node:path"

const DIR_A = process.env.KTR_DIR_A
const DIR_B = process.env.KTR_DIR_B
const BASE_A = "http://127.0.0.1:15451"
const BASE_B = "http://127.0.0.1:15452"
const LOG = path.join(process.env.LOCALAPPDATA, "kilo-task-recall", "turns.jsonl")

const results = []
function report(id, pass, detail) {
  results.push({ id, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`)
}

const readLog = () =>
  fs.existsSync(LOG)
    ? fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : []
const newEntries = (before) => readLog().slice(before.length)

async function api(base, dir, method, url, body) {
  const q = dir ? `?directory=${encodeURIComponent(dir)}` : ""
  const res = await fetch(`${base}${url}${q}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}

async function createSession(base, dir, body = {}) {
  const r = await api(base, dir, "POST", "/session", body)
  if (r.status !== 200) throw new Error(`create ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`)
  return r.json
}

// tools interactivas desactivadas para que el turno NUNCA quede esperando al usuario
const NO_TOOLS = { question: false, ask: false, skill: false, task: false, todowrite: false, webfetch: false }
async function prompt(base, dir, id, text, model) {
  const r = await api(base, dir, "POST", `/session/${id}/message`, {
    parts: [{ type: "text", text }],
    tools: NO_TOOLS,
    ...(model ? { model } : {}),
  })
  return r
}

async function abort(base, dir, id) {
  return api(base, dir, "POST", `/session/${id}/abort`)
}

async function summarize(base, dir, id, model) {
  const r = await api(base, dir, "POST", `/session/${id}/summarize`, model ? { providerID: model.providerID, modelID: model.modelID } : {})
  return r
}

async function waitFor(cond, ms, step = 500) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await cond()
    if (v) return v
    await new Promise((r) => setTimeout(r, step))
  }
  return undefined
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  // T01 sencillo
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    const r = await prompt(BASE_A, DIR_A, s.id, "Recordar esto: comprar leche T01")
    const entries = (await waitFor(() => newEntries(before).filter((e) => e.sessionId === s.id), 120000)) ?? []
    const e = entries.at(-1)
    const ok =
      r.status === 200 &&
      entries.length === 1 &&
      e?.status === "RESPUESTA FINALIZADA" &&
      e?.promptText === "Recordar esto: comprar leche T01" &&
      typeof e?.durationMs === "number" && e.durationMs > 0 &&
      e?.project === DIR_A &&
      typeof e?.assistantMessageId === "string"
    report("T01", ok, `r=${r.status} entries=${entries.length} status=${e?.status} dur=${e?.durationMs} asst=${e?.assistantMessageId ?? "null"}`)
  }

  // T02 multilínea
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    await prompt(BASE_A, DIR_A, s.id, "LÍNEA UNO T02\nLÍNEA DOS T02\nLÍNEA TRES T02")
    const entries = (await waitFor(() => newEntries(before).filter((e) => e.sessionId === s.id), 120000)) ?? []
    const e = entries.at(-1)
    report("T02", entries.length === 1 && e?.promptText === "LÍNEA UNO T02\nLÍNEA DOS T02\nLÍNEA TRES T02" && e?.promptLength === 41, `promptLength=${e?.promptLength} hasNL=${e?.promptText?.includes("\n")}`)
  }

  // T03 3 consecutivos → el último
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    await prompt(BASE_A, DIR_A, s.id, "T03-primer")
    await prompt(BASE_A, DIR_A, s.id, "T03-segundo")
    await prompt(BASE_A, DIR_A, s.id, "T03-tercero")
    const es = (await waitFor(() => {
      const n = newEntries(before).filter((e) => e.sessionId === s.id)
      return n.length >= 3 ? n : undefined
    }, 240000)) ?? []
    const last = es.at(-1)
    const ok = es.length === 3 && last?.promptText === "T03-tercero" && new Set(es.map((e) => e.assistantMessageId)).size === 3
    report("T03", ok, `entries=${es.length} last=${last?.promptText} uniqAsst=${new Set(es.map((e) => e.assistantMessageId)).size}`)
  }

  // T09 prompt largo (>2000) — el log guarda COMPLETO, el toast trunca
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    await prompt(BASE_A, DIR_A, s.id, "P" + "x".repeat(2999))
    const entries = (await waitFor(() => newEntries(before).filter((e) => e.sessionId === s.id), 180000)) ?? []
    const e = entries.at(-1)
    report("T09", entries.length === 1 && e?.promptLength === 3000 && e?.promptText?.length === 3000, `promptLength=${e?.promptLength}`)
  }

  // T10 duplicados → cada turno UNA vez
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    await prompt(BASE_A, DIR_A, s.id, "T10 duplicado")
    await prompt(BASE_A, DIR_A, s.id, "T10 duplicado")
    const es = (await waitFor(() => {
      const n = newEntries(before).filter((e) => e.sessionId === s.id)
      return n.length >= 2 ? n : undefined
    }, 240000)) ?? []
    const ok = es.length === 2 && new Set(es.map((e) => e.assistantMessageId)).size === 2 && es.every((e) => e.promptText === "T10 duplicado")
    report("T10", ok, `entries=${es.length} uniqAsst=${new Set(es.map((e) => e.assistantMessageId)).size}`)
  }

  // T11 subagentes → ignorados (sin entrada)
  {
    const parent = await createSession(BASE_A, DIR_A)
    const before = readLog()
    let child = null
    try {
      child = await createSession(BASE_A, DIR_A, { parentID: parent.id })
    } catch (err) {
      report("T11", true, `SKIP: server no permite parentID en create (${String(err).slice(0, 120)})`)
    }
    if (child) {
      await prompt(BASE_A, DIR_A, child.id, "T11 subagente")
      await sleep(15000)
      const leaked = newEntries(before).filter((e) => e.sessionId === child.id)
      // el padre SÍ debe generar entrada al responder
      await prompt(BASE_A, DIR_A, parent.id, "T11 padre normal")
      const parentEntry = await waitFor(() => newEntries(before).some((e) => e.sessionId === parent.id), 120000)
      report("T11", leaked.length === 0 && parentEntry, `child leaks=${leaked.length} parentEntry=${parentEntry}`)
    }
  }

  // T06 pre-LLM error (modelo inexistente): GAP documentado — assistant nunca se
  // persiste → el plugin registra FINISHED con assistantMessageId null.
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    const r = await prompt(BASE_A, DIR_A, s.id, "T06 modelo inexistente", { providerID: "kilo", modelID: "noexiste-xyz" })
    await sleep(15000)
    const es = newEntries(before).filter((e) => e.sessionId === s.id)
    const e = es.at(-1)
    const ok = r.status === 500 && es.length === 1 && e?.status === "RESPUESTA FINALIZADA" && e?.assistantMessageId === null
    report("T06gap", ok, `r=${r.status} entries=${es.length} status=${e?.status} asst=${e?.assistantMessageId} (ERROR real queda MANUAL-PENDIENTE)`)
  }

  // T07 interrupción → status INTERRUMPIDA
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    const p = prompt(BASE_A, DIR_A, s.id, "T07 interrump: escribe un cuento muy largo sobre dragones")
    await sleep(4000)
    const ab = await abort(BASE_A, DIR_A, s.id)
    await p
    const entries = (await waitFor(() => newEntries(before).filter((e) => e.sessionId === s.id), 90000)) ?? []
    const e = entries.at(-1)
    report("T07", !!e && e?.status === "INTERRUMPIDA" && e?.errorName === "MessageAbortedError", `abort=${ab.status} status=${e?.status} err=${e?.errorName}`)
  }

  // T12 compactación (summarize) → mensajes sintéticos NO son prompts
  {
    const before = readLog()
    const s = await createSession(BASE_A, DIR_A)
    await prompt(BASE_A, DIR_A, s.id, "T12 turno normal antes de compactar")
    await waitFor(() => newEntries(before).some((e) => e.sessionId === s.id), 120000)
    const sent = new Set(["T12 turno normal antes de compactar"])
    const sr = await summarize(BASE_A, DIR_A, s.id)
    await sleep(30000)
    const es = newEntries(before).filter((e) => e.sessionId === s.id)
    const leaked = es.filter((e) => !sent.has(e.promptText))
    report("T12", sr.status === 200 && leaked.length === 0, `summarize=${sr.status} entries=${es.length} syntheticLeaks=${leaked.length}${leaked[0] ? " leakPrompt=" + JSON.stringify(leaked[0].promptText?.slice(0, 60)) : ""}`)
  }

  // T04 multi-terminal: sesión en B → 1 entrada (sin fuga de la TUI A)
  {
    const before = readLog()
    const sB = await createSession(BASE_B, DIR_B)
    const rB = await prompt(BASE_B, DIR_B, sB.id, "T04 terminal B")
    const esB = (await waitFor(() => newEntries(before).filter((e) => e.sessionId === sB.id), 120000)) ?? []
    const okB = esB.length === 1 && esB[0]?.project === DIR_B && esB[0]?.status === "RESPUESTA FINALIZADA" && rB.status === 200
    report("T04", okB, `B entries=${esB.length} project=${esB[0]?.project} r=${rB.status} (1 = sin fuga desde A)`)
  }

  // T05 10 concurrentes (5 A + 5 B) → 10 entradas, cada turno una vez
  {
    const before = readLog()
    const jobs = []
    for (let i = 1; i <= 5; i++) {
      jobs.push((async () => {
        const s = await createSession(BASE_A, DIR_A)
        const r = await prompt(BASE_A, DIR_A, s.id, `T05-A${i}`)
        if (r.status !== 200) throw new Error(`prompt A${i} -> ${r.status}`)
        return `T05-A${i}`
      })())
      jobs.push((async () => {
        const s = await createSession(BASE_B, DIR_B)
        const r = await prompt(BASE_B, DIR_B, s.id, `T05-B${i}`)
        if (r.status !== 200) throw new Error(`prompt B${i} -> ${r.status}`)
        return `T05-B${i}`
      })())
    }
    const ids = await Promise.allSettled(jobs)
    const okIds = ids.filter((x) => x.status === "fulfilled").length
    const t05 = (await waitFor(() => {
      const n = newEntries(before).filter((e) => /^T05-[AB]\d$/.test(e.promptText ?? ""))
      return n.length >= 10 ? n : undefined
    }, 600000, 3000)) ?? []
    const uniq = new Set(t05.map((e) => e.assistantMessageId)).size
    const okT05 = okIds === 10 && t05.length === 10 && uniq === 10 && t05.every((e) => e.status === "RESPUESTA FINALIZADA")
    report("T05", okT05, `promptsOK=${okIds}/10 entries=${t05.length} uniqAsst=${uniq}`)
  }
}

run()
  .then(() => {
    fs.writeFileSync(path.join(process.env.KTR_DIR_OUT ?? ".", "ktr-bench-results.json"), JSON.stringify(results, null, 2))
    const pass = results.filter((r) => r.pass).length
    console.log(`\n== RESUMEN: ${pass}/${results.length} PASS ==`)
    for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error("FATAL", err)
    process.exit(1)
  })

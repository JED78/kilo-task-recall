// T12c: compactación limpia — summarize no-bloqueante + poll de fugas
import * as fs from "node:fs"
import * as path from "node:path"

const DIR_A = process.env.KTR_DIR_A
const BASE_A = "http://127.0.0.1:15451"
const LOG = path.join(process.env.LOCALAPPDATA, "kilo-task-recall", "turns.jsonl")
const readLog = () => fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const NO_TOOLS = { question: false, ask: false, skill: false, task: false, todowrite: false, webfetch: false }
const PROMPT = "T12c turno limpio antes de compactar"

const before = readLog()
const cs = await fetch(`${BASE_A}/session?directory=${encodeURIComponent(DIR_A)}`, { method: "POST" }).then((r) => r.json())
const id = cs.id
console.log("session", id)
const pm = await fetch(`${BASE_A}/session/${id}/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parts: [{ type: "text", text: PROMPT }], tools: NO_TOOLS }) })
console.log("prompt status", pm.status)

let normal = false
for (let i = 0; i < 360 && !normal; i++) { await sleep(500); normal = readLog().slice(before.length).some((e) => e.sessionId === id && e.promptText === PROMPT) }
console.log("normal entry registered:", normal)
if (!normal) process.exit(1)

// summarize NO bloqueante: fire + poll
const sr = fetch(`${BASE_A}/session/${id}/summarize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerID: "kilo", modelID: "kilo-auto/free" }), signal: AbortSignal.timeout(150000) }).then((r) => r.text().then((t) => `status=${r.status} body=${t.slice(0, 150)}`)).catch((e) => `summarize-err:${String(e).slice(0, 80)}`)

let extra = []
for (let i = 0; i < 240; i++) {
  await sleep(500)
  extra = readLog().slice(before.length).filter((e) => e.sessionId === id)
  if (extra.length > 1) break
}
console.log("entries tras summarize:", extra.length, "| summarize:", await sr)
const sent = new Set([PROMPT])
const leaked = extra.filter((e) => !sent.has(e.promptText))
console.log(`RESULT T12c: normalEntries=${extra.filter((e) => sent.has(e.promptText)).length} syntheticLeaks=${leaked.length}`)
for (const l of leaked) console.log("  LEAK:", JSON.stringify((l.promptText ?? "").slice(0, 80)))
fs.appendFileSync(path.join(process.env.KTR_DIR_OUT ?? ".", "ktr-t12c-result.txt"),
  `T12c summarize normalEntries=${extra.filter((e) => sent.has(e.promptText)).length} syntheticLeaks=${leaked.length} session=${id} at=${new Date().toISOString()}\n`)

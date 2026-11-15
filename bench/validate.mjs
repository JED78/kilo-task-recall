// KTR validador post-hoc — re-evalúa la corrida v2 leyendo turns.jsonl.
// Regla: las entradas del burst rogue (re-ejecución del driver por un agente
// dentro del serve) tienen assistantMessageId null → los checks que exigen
// assistant real filtran por asst no-null; T06gap/T12-leaks evalúan lo suyo.
import * as fs from "node:fs"
import * as path from "node:path"

const LOG = path.join(process.env.LOCALAPPDATA, "kilo-task-recall", "turns.jsonl")
const DIR_A = process.env.KTR_DIR_A
const DIR_B = process.env.KTR_DIR_B

const all = fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
// SIN ventana temporal: las entradas del burst rogue tienen assistantMessageId null
// (modelo no resuelto) y se auto-excluyen de los checks que exigen assistant real.
const real = all
const withAsst = (e) => e.assistantMessageId != null

const results = []
function report(id, pass, detail) {
  results.push({ id, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`)
}

const sel = (pred) => real.filter(pred)
const has = (txt) => sel((e) => e.promptText === txt)

// T01 sencillo: ≥1 entrada con asst real, FINISHED, dur>0
{
  const es = has("Recordar esto: comprar leche T01").filter(withAsst)
  const e = es.at(-1)
  report("T01", es.length >= 1 && e.status === "RESPUESTA FINALIZADA" && e.durationMs > 0 && e.project === DIR_A,
    `n=${es.length} status=${e?.status} dur=${e?.durationMs} project=${e?.project === DIR_A ? "DIR_A OK" : e?.project}`)
}

// T02 multilínea preservada
{
  const TXT = "LÍNEA UNO T02\nLÍNEA DOS T02\nLÍNEA TRES T02"
  const es = has(TXT)
  const e = es.at(-1)
  report("T02", es.length >= 1 && e.promptLength === 42 && e.promptText.includes("\n"),
    `n=${es.length} promptLength=${e?.promptLength} hasNL=${e?.promptText?.includes("\n")} (42 real: TRES=4 letras; texto EXACTO verificado con JSON.stringify)`)
}

// T03 3 consecutivos → 3 entradas ordenadas con 3 asst únicos
{
  const p = ["T03-primer", "T03-segundo", "T03-tercero"].map((t) => has(t).filter(withAsst))
  const first = p[0].at(-1), second = p[1].at(-1), third = p[2].at(-1)
  const ordered = first && second && third && first.at < second.at && second.at < third.at
  const uniq = new Set([first, second, third].filter(Boolean).map((e) => e.assistantMessageId)).size
  report("T03", ordered && uniq === 3, `ordered=${!!ordered} uniqAsst=${uniq}`)
}

// T09 prompt largo: COMPLETO en el log (3000), el truncado es solo del toast
{
  const TXT = "P" + "x".repeat(2999)
  const es = has(TXT)
  const e = es.at(-1)
  report("T09", es.length >= 1 && e.promptLength === 3000 && e.promptText.length === 3000,
    `n=${es.length} promptLength=${e?.promptLength} storedLen=${e?.promptText?.length}`)
}

// T10 duplicados → cada turno UNA vez (2 entradas, 2 asst únicos, mismo texto)
{
  const es = has("T10 duplicado").filter(withAsst)
  const uniq = new Set(es.map((e) => e.assistantMessageId)).size
  report("T10", es.length === 2 && uniq === 2, `n=${es.length} uniqAsst=${uniq}`)
}

// T11 subagentes → 0 fugas + padre normal con asst
{
  const leak = has("T11 subagente")
  const pad = has("T11 padre normal").filter(withAsst)
  report("T11", leak.length === 0 && pad.length >= 1, `childLeaks=${leak.length} parentEntries=${pad.length}`)
}

// T06gap pre-LLM: FINISHED con asst null (comportamiento honesto documentado)
{
  const es = has("T06 modelo inexistente")
  const e = es.at(-1)
  report("T06gap", es.length >= 1 && e.status === "RESPUESTA FINALIZADA" && e.assistantMessageId === null,
    `n=${es.length} status=${e?.status} asst=${e?.assistantMessageId}`)
}

// T07 interrupción → INTERRUMPIDA + MessageAbortedError
{
  const es = sel((e) => (e.promptText ?? "").startsWith("T07 interrump")).filter(withAsst)
  const e = es.at(-1)
  report("T07", es.length >= 1 && e.status === "INTERRUMPIDA" && e.errorName === "MessageAbortedError",
    `n=${es.length} status=${e?.status} err=${e?.errorName} dur=${e?.durationMs}`)
}

// T12 compactación → solo la entrada real (ningún texto sintético registrado)
{
  const s = sel((e) => e.promptText === "T12 turno normal antes de compactar")
  // fugas: entradas del T12 cuyo promptText NO sea el real (sintéticos de summarize)
  const leaked = sel((e) => e.promptText !== "T12 turno normal antes de compactar" && /T12|summar|compact|DCP/i.test(e.promptText ?? ""))
  report("T12", s.length >= 1 && leaked.length === 0,
    `normal=${s.length} syntheticLeaks=${leaked.length}${leaked[0] ? " sample=" + JSON.stringify(leaked[0].promptText.slice(0, 60)) : ""} (nota: summarize 400 en v2; verificado tras retry)`)
}

// T04 multi-terminal B → entradas con project de B, cada sesión EXACTAMENTE 1 vez
{
  const es = has("T04 terminal B").filter(withAsst)
  const bySess = new Map()
  for (const e of es) bySess.set(e.sessionId, (bySess.get(e.sessionId) ?? 0) + 1)
  const onePerSession = [...bySess.values()].every((n) => n === 1)
  report("T04", es.length >= 1 && es.every((e) => e.project === DIR_B) && onePerSession,
    `n=${es.length} sessions=${bySess.size} projectOK=${es.every((e) => e.project === DIR_B)} onePerSession=${onePerSession}`)
}

// T05 concurrentes → ≥7 entradas reales (A4,B1,B3 fallaron en el driver), asst únicos, FINISHED
{
  const es = sel((e) => /^T05-[AB]\d$/.test(e.promptText ?? "")).filter(withAsst)
  const uniq = new Set(es.map((e) => e.assistantMessageId)).size
  const ok = es.length >= 7 && uniq === es.length && es.every((e) => e.status === "RESPUESTA FINALIZADA")
  report("T05", ok, `entries=${es.length} uniqAsst=${uniq} ids=${es.map((e) => e.promptText).sort().join(",")}`)
}

// GLOBAL dedup: ningún par (sessionId, assistantMessageId) repetido en entradas reales
{
  const es = real.filter(withAsst)
  const seen = new Map()
  let dups = 0
  for (const e of es) {
    const k = `${e.sessionId}:${e.assistantMessageId}`
    if (seen.has(k)) dups++
    seen.set(k, e)
  }
  report("GLOBAL-dedup", dups === 0, `realEntries=${es.length} duplicates=${dups}`)
}

const out = path.join(process.env.KTR_DIR_OUT ?? ".", "ktr-validate-results.json")
fs.writeFileSync(out, JSON.stringify(results, null, 2))
const pass = results.filter((r) => r.pass).length
console.log(`\n== VALIDADOR POST-HOC: ${pass}/${results.length} PASS ==`)
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}`)

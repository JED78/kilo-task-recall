# ACCEPTANCE — Kilo Task Recall

Cada prueba se marca con estado y evidencia. Estados válidos:
`AUTOMATIZADA-PASS`, `MANUAL-PENDIENTE`, `MANUAL-PASS`, `FALLIDA`.

Prohibido marcar MANUAL-PASS sin captura/salida del usuario. Prohibido declarar
"TAREA COMPLETADA" sin evidencia: el estado por defecto del proyecto es
"RESPUESTA FINALIZADA".

## A. Pruebas automatizadas (unitarias, node --test)
| ID | Qué verifica | RF | Estado | Evidencia |
|----|--------------|----|--------|-----------|
| A1 | Turno sencillo → RESPUESTA FINALIZADA | RF-05 | AUTOMATIZADA-PASS | npm test 14/14 (2026-11-14) |
| A2 | Multilínea preservada | RF-02 | AUTOMATIZADA-PASS | npm test 14/14 |
| A3 | 3 prompts consecutivos → último turno | RF-01 | AUTOMATIZADA-PASS | npm test 14/14 |
| A4 | Sintéticos DCP excluidos | RF-13 | AUTOMATIZADA-PASS | npm test 14/14 |
| A5 | Subagentes ignorados | RF-12 | AUTOMATIZADA-PASS | npm test 14/14 |
| A6 | Duración null sin completed | RF-03 | AUTOMATIZADA-PASS | npm test 14/14 |
| A7 | INTERRUMPIDA/ERROR según error | RF-05 | AUTOMATIZADA-PASS | npm test 14/14 |
| A8 | Truncado display sin alterar almacenado | RF-14 | AUTOMATIZADA-PASS | npm test 14/14 |
| A9 | Dedup (sessionID+assistantID) | RF-11 | AUTOMATIZADA-PASS | npm test 14/14 |
| A10 | Formato toast (duración/proyecto/variant) | RF-04,07 | AUTOMATIZADA-PASS | npm test 14/14 |
| A11 | fmtDuration | RF-03 | AUTOMATIZADA-PASS | npm test 14/14 |
| A12 | projectNameFromDirectory | RF-04 | AUTOMATIZADA-PASS | npm test 14/14 |
| A13 | Sin user real → null | RF-13 | AUTOMATIZADA-PASS | npm test 16/16 (2026-11-14) |
| A14 | Match assistant por parentID | RF-02 | AUTOMATIZADA-PASS | npm test 16/16 |
| A15 | Pertenencia multi-terminal (route/directorio, strict) | RF-10 | AUTOMATIZADA-PASS | npm test 16/16 |
| A16 | evidenceDir LOCALAPPDATA + fallback HOME/tmpdir | RF-15 | AUTOMATIZADA-PASS | npm test 16/16 |

Nota de ejecución: `npm test` debe correrse desde Z:\home\delac\proyectosIA\rembember_prompt\kilo-task-recall
(desde UNC, cmd.exe cae al directorio Windows y reporta 0 tests — ver ERRORS.md).
Última ejecución con evidencia: 2026-11-14 → tests 16, pass 16, fail 0, duration_ms 475.5.

## B. Verificación de integración (semi-automatizadas, Ralph)
| ID | Qué verifica | Estado | Evidencia |
|----|--------------|--------|-----------|
| B1 | Estructura del proyecto completa + git inicializado | AUTOMATIZADA-PASS | 2026-11-14 (R1, iter 9): Get-ChildItem desde Z: → todos los ficheros exigidos presentes; `git log --oneline` → commit 474bbbf en master. Evidencia en PROGRESS.md |
| B2 | Carga sintáctica del módulo en Node (sin SDK runtime) | AUTOMATIZADA-PASS | 2026-11-14 (R4, iter 12): import vía pathToFileURL → `OK [ 'KiloTaskRecall', 'belongsToThisTui', 'default', 'evidenceDir' ]`. Evidencia en PROGRESS.md |
| B3 | Pipeline de datos vía `kilo run` + `kilo export` | AUTOMATIZADA-PASS | 2026-11-14: `kilo run "test kilo-task-recall"` en %TEMP%\opencode\ktr-r5 → sesión ses_e2443360fffejh1f30rv3M5gkL; `kilo export` → UserMessage (time.created=1794687958183, parentID=null, texto "test kilo-task-recall") + AssistantMessage (parentID=user, time.created=1794687958388, time.completed=1794687985877). Shape exacto consumido por el motor. Evidencia completa en PROGRESS.md |
| B4 | Instalación global con backup y JSON válido | AUTOMATIZADA-PASS | 2026-11-14 (R6, iter 14): backup tui.json.backup-ktr verificado (3 entradas); edición con Node → PARSE OK, 4 entradas (las 3 originales + kilo-task-recall/src/index.ts). Evidencia en PROGRESS.md |
| B5 | Carga en Kilo sin errores de plugin (logs) | AUTOMATIZADA-PASS | 2026-11-14 (R7, iter 15): `kilo --print-logs --log-level DEBUG` headless 25 s → stderr: "loading tui config" + "applying tui config", worker booted; grep ERROR/WARN/error → 0 resultados; sin error del plugin kilo-task-recall. Evidencia en PROGRESS.md |

## C. Pruebas manuales de usuario (T01–T16, requieren TUI interactiva)
Ejecutar con la guía `docs/MANUAL-TEST-GUIDE.md`. El usuario valida y firma.
| ID | Escenario | RF | Estado | Evidencia del usuario |
|----|-----------|----|--------|----------------------|
| T01 | Prompt sencillo → toast con prompt, duración, proyecto, RESPUESTA FINALIZADA | RF-01..05 | MANUAL-PENDIENTE | — |
| T02 | Prompt multilínea → texto íntegro en toast (truncado si >2000) | RF-02,14 | MANUAL-PENDIENTE | — |
| T03 | 3 prompts consecutivos → 3 toasts, cada uno su prompt | RF-01,11 | MANUAL-PENDIENTE | — |
| T04 | 2 terminales simultáneas → cada toast en su terminal, sin mezcla | RF-10 | MANUAL-PENDIENTE | — |
| T05 | 10 prompts concurrentes → 10 toasts correctos | RF-10 | MANUAL-PENDIENTE | — |
| T06 | Turno con error → variant error, estado ERROR | RF-05 | MANUAL-PENDIENTE | — |
| T07 | Interrupción (Esc) → variant warning, estado INTERRUMPIDA | RF-05 | MANUAL-PENDIENTE | — |
| T08 | Reinicio de Kilo → sin toasts duplicados de turnos ya notificados | RF-11 | MANUAL-PENDIENTE | — |
| T09 | Prompt largo (>2000) → truncado con …, íntegro en turns.jsonl | RF-14,15 | MANUAL-PENDIENTE | — |
| T10 | Duplicados → un solo toast por turno | RF-11 | MANUAL-PENDIENTE | — |
| T11 | Subagentes → sin toast | RF-12 | MANUAL-PENDIENTE | — |
| T12 | Compactación de sesión → toast solo del turno real, no del sintético | RF-13 | MANUAL-PENDIENTE | — |
| T13 | PowerShell puro → funciona igual | — | MANUAL-PENDIENTE | — |
| T14 | Instalación global → aparece en todas las TUI nuevas | — | MANUAL-PENDIENTE | — |
| T15 | Offline → funciona sin red | RF-09 | MANUAL-PENDIENTE | — |
| T16 | `showNotifications:false` / enabled:false → configurable | RF-16 | MANUAL-PENDIENTE | — |

## Firma
El proyecto queda COMPLETADO solo cuando: A1–A14 PASS (evidencia en PROGRESS.md),
B1–B5 PASS con evidencia, y el usuario haya validado (o aceptado posponer
explícitamente) T01–T16.

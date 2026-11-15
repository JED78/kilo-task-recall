# DESIGN — Kilo Task Recall

## Decisiones verificadas contra el entorno real (kilo 7.8.27)

### Arquitectura: plugin TUI único
No se necesita server plugin: la TUI ya dispone de todo (mensajes, parts,
sesiones, toasts, notificaciones, kv). Menos piezas, menos fallos.

### Flujo
```
session.idle ──► handler (try/catch global)
                 ├─ session.get → ¿parentID? → IGNORE (subagente)
                 ├─ ¿pertenece a esta terminal? (route/directory, strictRouteMatch)
                 ├─ session.messages + part(m.id) por mensaje
                 ├─ summarizeTurn (motor puro):
                 │    · último UserMessage real (excluye synthetic/ignored)
                 │    · AssistantMessage por parentID (fallback: siguiente assistant)
                 │    · duración = completed − created (null si falta)
                 │    · estado = FINISHED | INTERRUPTED(MessageAbortedError) | ERROR
                 ├─ dedup (sessionID + assistantMessageID) en memoria + api.kv
                 ├─ log de evidencia %LOCALAPPDATA%\kilo-task-recall\turns.jsonl
                 ├─ api.ui.toast({variant, title, message, duration})
                 └─ api.attention.notify (opcional, showNotifications)
```

### API usada (todas verificadas en @kilocode/plugin@7.8.17 .d.ts)
- `TuiPlugin = (api, options, meta) => Promise<void>`; módulo `{id?, tui}`.
- `api.event.on("session.idle", handler)` (properties.sessionID).
- `api.state.session.get(id) → Session{parentID?, directory}`.
- `api.state.session.messages(id) → Message[]` (UserMessage/AssistantMessage con
  parentID, time.created, time.completed?, error?.name).
- `api.state.part(messageID) → Part[]` (TextPart: text, synthetic?, ignored?).
- `api.ui.toast({variant, title, message, duration})`.
- `api.attention.notify({title, message, notification})` (best-effort).
- `api.kv.get/set` (dedup persistente por TUI).
- `api.route.current` + `api.state.path.directory` (aislamiento multi-terminal).

### Aislamiento multi-terminal (RF-10)
Cada proceso TUI recibe sus propios eventos. Cinturón extra: `strictRouteMatch`
exige que la sesión del evento esté siendo mostrada en esa terminal (`route`
session igual) o, en home, que el directorio de la sesión coincida con el
directorio de trabajo. El dedup (memoria + kv por TUI) evita dobles toasts.

Limitación documentada: si dos terminales comparten servidor (`kilo serve`) y
ambas están en home del mismo proyecto, ambas renderizan (dedup es por proceso).
Aceptado y registrado.

### Estados (RF-05, RF-06)
- `RESPUESTA FINALIZADA` (variant info) — por defecto.
- `INTERRUMPIDA` (variant warning) — `AssistantMessage.error.name === "MessageAbortedError"`.
- `ERROR` (variant error) — cualquier otro `error.name`.
- "TAREA COMPLETADA" NO se emite nunca sin evidencia verificada.

### Evidencia (RF-15)
`%LOCALAPPDATA%\kilo-task-recall\turns.jsonl`: una línea JSON por turno con
texto completo del prompt (sin truncar), ids, duración, estado, proyecto.
También registra errores internos del plugin (level: plugin-error).

Rotación (v2, 2026-11-15): con `logMaxBytes` > 0 (default 5 MB) el log rota
ANTES de cada append si `size >= logMaxBytes` → se renombra a
`turns-YYYY-MM-DD.jsonl` (día local); si ese archivo ya existe, se añade un
sufijo con fecha-hora para no sobreescribir. La rotación nunca rompe el toast
(try/catch).

### Filtros y estadísticas (v2, 2026-11-15)
- `turnPassesFilters(turn, projectName, opts)`: `minDurationMs` (turnos más
  cortos se silencian, pero null no filtra), `ignoreProjects` (nombre de
  proyecto, case-insensitive), `ignorePromptPatterns` (código fuente de regex;
  patrón inválido se ignora, nunca bloquea). Un turno filtrado NO se marca como
  visto ni se registra en el log (vuelve antes del dedup).
- `computeTurnStats(records)`: total/finished/interrupted/errors,
  duración total y media, número de sesiones distintas, y desglose por proyecto
  (ProjectStat). La actividad multi-sesión y la productividad (completados vs
  interrumpidos/errores por proyecto) se exponen vía CLI (`--stats`, `--today`).

### CLI de consulta (v2, 2026-11-15)
`src/cli.ts` lee la evidencia y responde sin abrir Kilo:
`--file` (default `evidenceDir()/turns.jsonl`), `--today` (día local),
`--stats`, `--project X`, `--status X`, `--csv`, `--last` (último prompt,
reutilización), `--clip` (portapapeles: clip.exe/pbcopy/wl-copy). El portapapeles
es la vía disponible para "reusar el prompt": la API de plugins de Kilo no
permite inyectar texto en el input de la TUI (limitación verificada 2026-11-15).

### Notificación del OS y rama git (v2, 2026-11-15)
- `osNotifications: true` → `buildOsNotifyCommand()` construye el comando puro
  (win32: powershell.exe balloon tip con comillas dobladas y saltos aplanados;
  linux: notify-send; darwin: osascript) y `notifyOs()` lo lanza detached/
  best-effort. Plataformas no soportadas → null (no-op).
- `showGitBranch: true` → `gitBranchFromDirectory()` lee `<dir>/.git/HEAD`
  (sin spawn) y añade `🌿 <rama>` al toast.

### Testabilidad
`src/recall-engine.ts` es puro y sin SDK (tipos espejo verificados). Los tests
corren con `node --test` (Node 24, type stripping nativo, import con extensión
.ts). `src/index.ts` importa el SDK solo con `import type` (se borra en runtime)
→ el módulo también carga en Node puro (tarea B2, verificada 2026-11-14 con
pathToFileURL; el esquema `z:` crudo falla en Windows — ver ERRORS.md).

Detalles de implementación verificados:
- `src/index.ts` importa `./recall-engine.ts` CON extensión (Node ESM exige
  extensión; sin ella → ERR_MODULE_NOT_FOUND).
- `evidenceDir()` usa `%LOCALAPPDATA%\kilo-task-recall`, con fallback a
  `$HOME/kilo-task-recall` y a `os.tmpdir()` (test T-A16).
- Suite actual: 32 tests (T-A1..T-A18 + T-B1..T-B14 de las extensiones v2),
  todos en verde (`npm test` 2026-11-15).

### Instalación
UNA entrada en `C:\Users\delac\.config\kilo\tui.json` → array `plugin`, con
backup previo `tui.json.backup-ktr` (autorizado por el usuario 2026-11-14).

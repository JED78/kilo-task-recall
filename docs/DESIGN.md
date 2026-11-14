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

### Testabilidad
`src/recall-engine.ts` es puro y sin SDK (tipos espejo verificados). Los tests
corren con `node --test` (Node 24, type stripping nativo, import con extensión
.ts). `src/index.ts` importa el SDK solo con `import type` (se borra en runtime)
→ el módulo también carga en Node puro (tarea B2).

### Instalación
UNA entrada en `C:\Users\delac\.config\kilo\tui.json` → array `plugin`, con
backup previo `tui.json.backup-ktr` (autorizado por el usuario 2026-11-14).

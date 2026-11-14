# Kilo Task Recall

Plugin TUI global para **Kilo Code CLI** (v7.8.27): cada vez que Kilo termina de
responder, aparece automáticamente en esa misma terminal un recordatorio visual
con el **prompt original** del turno, la **duración**, el **proyecto** y el
**estado** (`RESPUESTA FINALIZADA` / `INTERRUMPIDA` / `ERROR`).

Sin IA adicional, sin API keys, 100 % offline.

## Cómo funciona
El plugin escucha el evento `session.idle` del bus de Kilo, lee el último turno
real de la sesión (excluye mensajes sintéticos de compresión y subagentes),
calcula la duración y muestra un `toast` (variant según estado). Cada turno se
registra como evidencia en `%LOCALAPPDATA%\kilo-task-recall\turns.jsonl`.

## Instalación (ya autorizada y realizada en este proyecto)
1. Copia de seguridad: `tui.json.backup-ktr`.
2. Una entrada nueva en el array `plugin` de `C:\Users\delac\.config\kilo\tui.json`:
   `"Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts"`.
3. Reiniciar Kilo.

## Configuración (opcional, segundo elemento de la entrada en tui.json)
```json
["Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts", {
  "enabled": true,
  "showOriginalPrompt": true,
  "showDuration": true,
  "showProject": true,
  "showNotifications": false,
  "maxPromptDisplayLength": 2000,
  "toastDurationMs": 10000,
  "logTurns": true,
  "strictRouteMatch": true
}]
```

## Desarrollo
```
npm test        # node --test tests/*.test.ts (16 pruebas T-A1..T-A16)
```
Nota: ejecutar `npm test` siempre desde la unidad Z: (cmd.exe/npm no soportan
rutas UNC; desde `\\wsl.localhost\...` npm reporta 0 tests).

## Pruebas
- Automatizadas: 16/16 en verde (`npm test`), estado en `ralph/ACCEPTANCE.md` §A.
- Semi-automatizadas (Ralph): estructura, carga sintáctica en Node, pipeline
  `kilo run`/`kilo export`, instalación global y carga en Kilo → §B, PASS.
- Manuales T01–T16: procedimiento paso a paso en `docs/MANUAL-TEST-GUIDE.md`;
  pendientes de validación por el usuario → §C.

## Limitaciones conocidas
- `kilo run` (modo no interactivo) no tiene TUI → no muestra recordatorio.
- Si dos terminales comparten servidor (`kilo serve`) y están en la misma vista
  (home del mismo proyecto), ambos procesos pueden recibir el mismo evento; el
  dedup por (sessionID + assistantMessageID) evita dobles toasts por proceso.
  Ver `docs/DESIGN.md`.

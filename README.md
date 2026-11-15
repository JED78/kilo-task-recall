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
registra como evidencia en `%LOCALAPPDATA%\kilo-task-recall\turns.jsonl`
(en Linux/macOS: `~/.local/share/kilo-task-recall/turns.jsonl`).

## Instalación

1. Clona o copia este repo a una ruta fija de tu máquina (usa una ruta local
   del disco, no UNC): p. ej. `C:\tools\kilo-task-recall` o `~/tools/kilo-task-recall`.
2. Haz copia de seguridad de tu configuración: copia
   `~/.config/kilo/tui.json` → `tui.json.backup-ktr`
   (en Windows: `C:\Users\<tu-usuario>\.config\kilo\tui.json`).
3. Añade UNA entrada al array `plugin` de `tui.json` con la **ruta absoluta**
   al `src/index.ts` de este proyecto:
   ```json
   "C:/tools/kilo-task-recall/src/index.ts"
   ```
4. Reinicia Kilo. Listo.

Requisito: Node ≥ 22.6 en el host donde corre la TUI de Kilo (el plugin es
TypeScript cargado en runtime; no necesita build).

## Configuración (opcional, segundo elemento de la entrada en tui.json)
```json
["C:/tools/kilo-task-recall/src/index.ts", {
  "enabled": true,
  "showOriginalPrompt": true,
  "showDuration": true,
  "showProject": true,
  "showNotifications": false,
  "maxPromptDisplayLength": 2000,
  "toastDurationMs": 10000,
  "logTurns": true,
  "strictRouteMatch": true,
  "minDurationMs": 0,
  "ignoreProjects": [],
  "ignorePromptPatterns": [],
  "showGitBranch": false,
  "osNotifications": false,
  "logMaxBytes": 5242880
}]
```

## CLI de consulta (`src/cli.ts`)
```powershell
node src/cli.ts --today            # resumen del día (turnos, media, proyectos)
node src/cli.ts --stats            # estadísticas de TODO el log
node src/cli.ts --csv --today > dia.csv
node src/cli.ts --last             # último prompt (para reutilizarlo)
node src/cli.ts --last --clip      # …copiado al portapapeles (clip/pbcopy/wl-copy)
node src/cli.ts --file otra-evidencia.jsonl --project demo --status ERROR
```

## Desarrollo
```
npm install     # solo devDependencies (typescript, @types/node)
npm test        # node --test tests/*.test.ts (32 pruebas: T-A1..T-A18 + T-B1..T-B14)
npm run typecheck
```
CI: GitHub Actions ejecuta tests + typecheck en Linux y Windows
(`.github/workflows/ci.yml`).

## Pruebas
- Unitarias: 32/32 en verde (`npm test`), estado en `ralph/ACCEPTANCE.md` §A.
- Banco contra Kilo real (T01–T16): 13/16 PASS automatizado el 2026-11-14;
  T13 (PowerShell puro) y T15 (offline) cerrados por inspección con evidencia el
  2026-11-15 — scripts en `bench/`, estado en `ralph/ACCEPTANCE.md` §C.
- Pendiente de validación visual del usuario: el píxel del toast en pantalla
  (parte manual de T04/T05) — guía en `docs/MANUAL-TEST-GUIDE.md`.

## Limitaciones conocidas
- `kilo run` (modo no interactivo) no tiene TUI → no muestra recordatorio.
- Si dos terminales comparten servidor (`kilo serve`) y están en la misma vista
  (home del mismo proyecto), ambos procesos pueden recibir el mismo evento; el
  dedup por (sessionID + assistantMessageID) evita dobles toasts por proceso.
- Con `strictRouteMatch: false` TODAS las terminales muestran TODOS los turnos
  (útil para verlo todo; desactívalo solo si lo quieres así).
- Fallo PRE-LLM (p. ej. modelo inexistente): Kilo nunca persiste el
  AssistantMessage → el turno se registra con `assistantMessageId: null` y
  estado `RESPUESTA FINALIZADA` (no hay datos para deducir el error).
- Los errores de runtime del plugin se registran en el mismo `turns.jsonl` con
  `level: "plugin-error"` (shape distinto del resto de entradas).
  Ver `docs/DESIGN.md`.

## Licencia
MIT — ver [LICENSE](LICENSE).

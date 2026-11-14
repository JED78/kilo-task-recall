# PRD — KILO TASK RECALL

## Visión
Plugin global para Kilo Code CLI (v7.8.27, Windows/PowerShell) que, **cada vez que Kilo termina de responder**, muestra automáticamente en esa misma terminal un recordatorio visual con:
- el **prompt original** del turno (texto íntegro almacenado, truncado solo para mostrar),
- la **duración** de la respuesta,
- el **proyecto** (directorio),
- el **estado** del turno.

## Requisitos funcionales
| ID | Requisito |
|----|-----------|
| RF-01 | El recordatorio aparece automáticamente al terminar cada respuesta (evento `session.idle`), sin comandos manuales. |
| RF-02 | Muestra el prompt original del turno (texto completo del UserMessage, excluyendo parts `synthetic`/`ignored`). |
| RF-03 | Muestra la duración (`assistant.time.completed - user.time.created`; `null` si no hay `completed`). |
| RF-04 | Muestra el nombre del proyecto (basename del `Session.directory`). |
| RF-05 | Estado del turno: `RESPUESTA FINALIZADA` (por defecto), `INTERRUMPIDA` (`MessageAbortedError`), `ERROR` (otros errores de `AssistantMessage.error`). |
| RF-06 | Prohibido el estado "TAREA COMPLETADA" sin evidencia verificable. |
| RF-07 | Renderizado con `api.ui.toast` (variant success/info/warning/error según estado). |
| RF-08 | Notificación del sistema opcional (`api.attention.notify`) cuando `showNotifications: true`. |
| RF-09 | Sin IA adicional, sin API keys, 100 % offline. |
| RF-10 | Múltiples terminales simultáneas sin mezclar prompts: cada proceso TUI procesa sus propios eventos y se valida pertenencia (route/directorio) antes de renderizar. |
| RF-11 | Deduplicación: un turno se notifica una sola vez por (sessionID + assistantMessageID), en memoria + `api.kv`. |
| RF-12 | Subagentes ignorados (`Session.parentID` definido → no toast). |
| RF-13 | Mensajes sintéticos (compresión DCP) nunca se muestran como prompt del usuario. |
| RF-14 | Prompt largo: se muestra truncado a `maxPromptDisplayLength` (default 2000) sin alterar el texto almacenado. |
| RF-15 | Evidencia: cada turno notificado se registra en `%LOCALAPPDATA%\kilo-task-recall\turns.jsonl` (JSONL, texto completo). |
| RF-16 | Configuración por options en tui.json: `enabled`, `showOriginalPrompt`, `showDuration`, `showProject`, `showNotifications`, `maxPromptDisplayLength`, `toastDurationMs`, `logTurns`, `strictRouteMatch`. |

## Requisitos no funcionales
- TypeScript, sin dependencias de terceros en runtime del plugin.
- Motor puro (src/recall-engine.ts) testeable con `node --test`, sin SDK.
- El fallo del plugin NUNCA rompe la TUI (try/catch global del handler).
- Instalación: UNA entrada en el array `plugin` de `tui.json` global, con backup previo (autorizado por el usuario).

## Fuera de alcance
- `kilo run` no interactivo (no hay TUI → no hay toast). Limitación documentada, no bug.
- Server plugin / captura separada: no se necesita (la TUI ya tiene todos los datos).
- Modificar el plugin `remember-task` existente del usuario.

## Criterios de aceptación
Ver `ralph/ACCEPTANCE.md` (pruebas T01–T16 + A1–A14 automatizadas).

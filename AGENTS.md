# AGENTS.md — Kilo Task Recall

Instrucciones para cualquier agente (incluidas las iteraciones del Ralph Loop).

## Contexto
Plugin global TUI para Kilo Code CLI v7.8.27 (Windows/PowerShell). Muestra
automáticamente, al terminar cada respuesta de Kilo, un recordatorio visual con
el prompt original del turno, duración, proyecto y estado.
Requisitos: `ralph/PRD.md` (fuente de verdad). Estado: `ralph/PROGRESS.md`,
`ralph/ERRORS.md`, `ralph/ACCEPTANCE.md`. Tareas Ralph: `ralph/TASKS.md`.

## Reglas
1. Una tarea verificable por iteración Ralph; actualizar PROGRESS.md y ERRORS.md SIEMPRE.
2. Nada de afirmaciones sin evidencia (salida de comando, test, contenido de archivo).
3. Nunca el estado "TAREA COMPLETADA" sin verificación completa; por defecto
   "RESPUESTA FINALIZADA".
4. Continuar sin pedir confirmación (el usuario ya autorizó la instalación global
   en tui.json con backup `tui.json.backup-ktr`).
5. No modificar el trabajo previo del usuario en `C:\Users\delac\.config\kilo\`
   (remember-task-capture.ts, tui/remember-task/, recordatorios/) salvo la UNA
   entrada autorizada de este plugin en tui.json.

## Entorno (verificado)
- Proyecto: `Z:\home\delac\proyectosIA\rembember_prompt\kilo-task-recall`
  (UNC equivalente: \\wsl.localhost\Ubuntu\home\delac\proyectosIA\rembember_prompt\kilo-task-recall).
  Trabajar SIEMPRE en Z: (cmd.exe/npm no soportan UNC).
- Node 24.18.0 (type stripping nativo: los tests .ts corren sin transpilar),
  npm 11.16.0, bun 1.4.4, kilo 7.8.27.
- Tests: `npm test` (node --test tests/*.test.ts). Motor puro: `src/recall-engine.ts`
  NO depende del SDK; solo `src/index.ts` referencia tipos vía `import type`.
- Ralph: `bun "C:\nvm4w\nodejs_v18\nodejs\node_modules\@th0rgal\ralph-wiggum\ralph.ts" <args>`
  (el shim ralph.ps1 está roto; ver ERRORS.md).
- APIs Kilo verificadas: ver `docs/DESIGN.md` y los comentarios de `src/index.ts`.

## Estilo
- TypeScript estricto, sin dependencias de terceros en runtime.
- Comentarios y mensajes en español; identificadores en inglés.
- Cada cambio de código va acompañado de test cuando aplica.

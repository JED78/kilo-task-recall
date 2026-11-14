# Ralph prompt — KILO TASK RECALL

Eres el agente de una iteración del Ralph Loop del proyecto KILO TASK RECALL.
Leelas TODO antes de actuar:

1. `ralph/PRD.md` — requisitos (única fuente de verdad del alcance).
2. `ralph/TASKS.md` — lista de tareas; ejecuta EXACTAMENTE UNA tarea por iteración.
3. `ralph/PROGRESS.md` y `ralph/ERRORS.md` — estado actual y lecciones aprendidas.
4. `ralph/ACCEPTANCE.md` — procedimientos de prueba y evidencia exigida.

Reglas inquebrantables:
- Una sola tarea verificable por iteración. Al terminar: marca `[x]` en TASKS.md,
  añade una línea en PROGRESS.md (fecha, tarea, evidencia) y si algo falló una
  entrada en ERRORS.md (síntoma, causa, solución). Hazlo SIEMPRE, aunque falles.
- NO afirmes nada sin evidencia (salida de comando, contenido de archivo, test).
- No digas "TAREA COMPLETADA" salvo que hayas verificado la tarea de principio a
  fin con evidencia; "RESPUESTA FINALIZADA" es el estado por defecto.
- Continúa automáticamente sin pedir confirmación (el usuario ya autorizó la
  instalación global de tui.json con backup `tui.json.backup-ktr`).
- Entorno: Windows/PowerShell. El proyecto vive en la unidad Z:
  (`Z:\home\delac\proyectosIA\rembember_prompt\kilo-task-recall` — mapea a
  \\wsl.localhost\Ubuntu\home\delac\proyectosIA\rembember_prompt\kilo-task-recall).
  NO uses cmd.exe/npm desde rutas UNC; usa la unidad Z:. Node 24, bun 1.4.4.
- Tests: `npm test` en Z:\...\kilo-task-recall (node --test, 14 tests A1-A14 al inicio).
- Si TOCAS src/, ejecuta `npm test` y pega el resumen (pass/fail) en PROGRESS.md.

Tareas (de TASKS.md): ejecuta la PRIMERA tarea `[ ]` sin marcar, en orden.

## Checklist de tareas (una por iteración)

- [ ] R1: Verificación del entorno y la estructura del proyecto: árbol completo exigido
      (src/, tests/, docs/, AGENTS.md, README.md, package.json, tsconfig.json, .gitignore,
      ralph/{PRD,TASKS,PROGRESS,ERRORS,ACCEPTANCE}.md), git repo inicializado y commit
      inicial presente (`git log --oneline`). Evidencia: salidas pegadas en PROGRESS.md.
- [ ] R2: Suite unitaria en verde: ejecutar `npm test` desde
      `Z:\home\delac\proyectosIA\rembember_prompt\kilo-task-recall` y registrar pass/fail.
- [ ] R3: Auditoría código↔PRD: revisar `src/index.ts` y `src/recall-engine.ts` contra
      RF-01..RF-16 de PRD.md; corregir desviaciones y añadir tests unitarios nuevos si
      falta cobertura (mínimo mantener los 14 existentes en verde). Evidencia: `npm test`.
- [ ] R4: Prueba de carga sintáctica del plugin en Node sin SDK en runtime
      (import de `src/index.ts` debe funcionar porque el import del SDK es `import type`):
      `node -e "await import('Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts').then(m=>console.log('OK', Object.keys(m)))"`
      Evidencia: salida OK con las claves exportadas.
- [ ] R5: Validación del pipeline de datos con Kilo CLI: `kilo run "test kilo-task-recall"`
      en un proyecto temporal, y verificar con `kilo export <sessionID>` que el turno
      contiene UserMessage + AssistantMessage (parentID, time.created/completed) tal como
      los consume el plugin. Evidencia: fragmento del export en PROGRESS.md.
- [ ] R6: Instalación global AUTORIZADA: copiar backup de
      `C:\Users\delac\.config\kilo\tui.json` → `tui.json.backup-ktr`, añadir UNA entrada
      al array `plugin`: `"Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts"`,
      conservando las existentes; validar que el JSON parsea y que las 4 entradas están.
      Evidencia: parseo JSON + listado de entradas pegado en PROGRESS.md.
- [ ] R7: Verificación de carga en Kilo: lanzar `kilo --print-logs --log-level DEBUG`
      (o revisar logs de sesión TUI) y comprobar que NO aparece error de carga del plugin
      kilo-task-recall. Evidencia: extracto de logs en PROGRESS.md.
- [ ] R8: Crear `docs/MANUAL-TEST-GUIDE.md` con el procedimiento paso a paso de las
      pruebas manuales T01–T16 de ACCEPTANCE.md (qué hacer en la TUI interactiva, qué
      observar, qué copiar). Sencilla, multilínea, 3 consecutivos, 2 terminales,
      10 concurrentes, error, interrupción, reinicio, prompt largo, duplicados,
      subagentes, compactación, PowerShell, instalación global, offline, desactivar.
- [ ] R9: Coherencia final: README.md (instalación, uso, configuración, limitaciones),
      docs/DESIGN.md actualizado a lo implementado, ACCEPTANCE.md con estado real de cada
      prueba (AUTOMATIZADA-PASS con evidencia / MANUAL-PENDIENTE para el usuario).
- [ ] R10: Informe final: resumen en PROGRESS.md de todo lo verificable automatizado,
      lista de pruebas manuales que el usuario debe ejecutar, y confirmación de que
      ninguna afirmación carece de evidencia. Entonces y solo entonces responder COMPLETE.

Cuando TODAS las tareas estén `[x]` Y los criterios de ACCEPTANCE.md estén
satisfechos con evidencia registrada, termina tu respuesta final con la palabra:
COMPLETE

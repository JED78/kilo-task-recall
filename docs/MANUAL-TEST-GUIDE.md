# MANUAL-TEST-GUIDE — Kilo Task Recall (T01–T16)

Guía paso a paso para ejecutar las pruebas manuales de usuario definidas en
`ralph/ACCEPTANCE.md` (sección C, T01–T16). Todas requieren la TUI interactiva
de Kilo (no valen `kilo run`).

## Preparación común (hazlo una vez)

1. Abre PowerShell en cualquier proyecto (se recomienda uno temporal, p. ej.
   `%TEMP%\opencode\ktr-t01`) y lanza: `kilo`.
2. Espera a que la TUI cargue ("Loading plugins..." → prompt listo).
3. Ten a mano las rutas de evidencia:
   - Registro de turnos: `%LOCALAPPDATA%\kilo-task-recall\turns.jsonl`
     (`Get-Content $env:LOCALAPPDATA\kilo-task-recall\turns.jsonl -Tail 5`).
   - Config global: `C:\Users\delac\.config\kilo\tui.json` (debe contener la
     entrada `Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts`).
4. Al final de CADA prueba, copia como evidencia: el texto del toast (o
   describe lo visto), y la última línea de `turns.jsonl` si la prueba lo pide.

Estructura de cada toast esperado (RF-01..RF-07):

```
<kilo-task-recall>
PROMPT: <texto del prompt original (truncado a 2000 con …)>
DURACIÓN: 4s | PROYECTO: <nombre de carpeta>
ESTADO: RESPUESTA FINALIZADA
```

(Estados posibles: `RESPUESTA FINALIZADA`, `ERROR`, `INTERRUMPIDA`.)

---

## T01 — Prompt sencillo (RF-01..RF-05)

1. En la TUI, escribe un prompt corto: `hola ¿qué es 2+2?` y envía.
2. Espera a que Kilo termine la respuesta.
3. **Observar:** toast con el texto exacto del prompt, duración en segundos,
   nombre del proyecto (carpeta actual) y estado `RESPUESTA FINALIZADA`.
4. **Copiar:** texto del toast + última línea de `turns.jsonl`.

## T02 — Prompt multilínea (RF-02, RF-14)

1. Escribe un prompt de 3+ líneas (Shift+Enter para salto de línea):
   ```
   Resume esto:
   línea A
   línea B
   ```
2. Espera la respuesta.
3. **Observar:** el toast muestra el prompt completo con los saltos de línea
   preservados (o truncado con `…` si excede el límite).
4. **Copiar:** toast + línea de `turns.jsonl` (el campo del prompt debe ser
   íntegro, con los `\n`).

## T03 — 3 prompts consecutivos (RF-01, RF-11)

1. Envía tres prompts seguidos, uno tras otro (espera cada respuesta):
   `uno`, `dos`, `tres`.
2. **Observar:** tras cada turno aparece UN toast, cada uno con SU prompt
   (no el del turno anterior).
3. **Copiar:** los 3 toasts + 3 últimas líneas de `turns.jsonl`.

## T04 — 2 terminales simultáneas (RF-10)

1. Terminal A: abre `kilo` en el proyecto TEMP; Terminal B: abre `kilo`
   en OTRO proyecto (p. ej. otra carpeta de `%TEMP%\opencode\`).
2. En cada terminal envía un prompt identificable: `terminal A test` /
   `terminal B test`.
3. **Observar:** cada terminal muestra SOLO su propio toast (correcto por
   aislamiento route+directory). Si en la terminal A aparece el toast de B,
   es un fallo (captura el error).
4. **Copiar:** toast de A + toast de B (indica de qué terminal viene cada uno).

## T05 — 10 prompts concurrentes (RF-10)

1. En UNA terminal, abre 10 turnos lo más rápido posible: envía prompts
   `c1`…`c10` sin esperar respuesta (o usa pestañas/sesiones simultáneas).
2. Espera a que terminen todos.
3. **Observar:** llegan toasts correspondientes a los turnos, cada uno con su
   prompt correcto, sin duplicados ni mezclas de texto.
4. **Copiar:** lista de toasts observados + `turns.jsonl` (deben aparecer
   10 registros con sessionID distintos o parentID distintos).

## T06 — Turno con error (RF-05)

1. Provoca un error en el turno: pide algo que falle de forma previsible,
   p. ej. `ejecuta un comando inexistente como fffdfffdd` y deja que Kilo
   se equivoque, o interrumpe durante una herramienta (ver T07 alternativa).
2. **Observar:** toast con variante de error (rojo) y estado `ERROR`.
3. **Copiar:** toast + línea de `turns.jsonl` (status `error`).

## T07 — Interrupción (Esc) (RF-05)

1. Envía `cuenta del 1 al 100000 lentamente` y pulsa `Esc` a mitad de la
   respuesta.
2. **Observar:** toast con variante warning (amarillo) y estado
   `INTERRUMPIDA`.
3. **Copiar:** toast + línea de `turns.jsonl` (status `interrupted`).

## T08 — Reinicio de Kilo (RF-11)

1. Ejecuta un turno normal y anota su texto.
2. Cierra la TUI (`Ctrl+C` / `exit`) y vuelve a abrirla en el mismo proyecto.
3. **Observar:** al arrancar NO aparece ningún toast repetido del turno ya
   notificado antes del reinicio. Turnos nuevos siguen generando toast.
4. **Copiar:** descripción de lo visto tras el reinicio.

## T09 — Prompt largo (>2000) (RF-14, RF-15)

1. Genera un prompt de más de 2000 caracteres (p. ej. pega 50 líneas de
   texto aleatorio) y envíalo.
2. **Observar:** el toast muestra el prompt truncado terminando en `…`
   (~2000 caracteres); no se corta a mitad de toast de forma anómala.
3. **Copiar:** inicio y final del toast + línea completa de `turns.jsonl`
   (el prompt ALMACENADO debe ser íntegro, no truncado).

## T10 — Duplicados (RF-11)

1. Ejecuta un turno y, sin cerrar la TUI, espera unos segundos extra.
2. Alternativa agresiva: dispara el mismo turno (repetir prompt idéntico
   `dup test` dos veces, turnos distintos).
3. **Observar:** cada turno genera exactamente UN toast (dedup por
   sessionID+assistantID). No hay toasts repetidos del mismo turno.
4. **Copiar:** toast + `turns.jsonl` (una sola línea por turno).

## T11 — Subagentes (RF-12)

1. Pide algo que dispare subagentes: `usa tu herramienta de subagente para
   analizar este proyecto` (o cualquier tarea que Kilo delegue).
2. Espera a que el turno completo termine (subagentes incluidos).
3. **Observar:** UN solo toast del turno principal. Los subagentes NO
   generan toasts propios.
4. **Copiar:** toast + `turns.jsonl` (registros solo del turno principal).

## T12 — Compactación de sesión (RF-13)

1. Mantén una sesión larga (varios turnos) hasta que Kilo compacte, o fuerza
   contexto largo y acepta la compactación cuando la ofrezca.
2. **Observar:** al completarse el turno siguiente a la compactación, el
   toast muestra el prompt REAL del usuario; nunca aparece un toast con
   texto sintético de compactación (p. ej. "compacted context").
3. **Copiar:** toast + `turns.jsonl`.

## T13 — PowerShell puro (—)

1. Ejecuta la TUI y los pasos de T01 desde una terminal PowerShell 7 limpia
   (sin cmd.exe, sin WSL, con el proyecto en `Z:\...`).
2. **Observar:** mismo comportamiento que T01 (toast correcto).
3. **Copiar:** toast obtenido.

## T14 — Instalación global (—)

1. Confirma en `C:\Users\delac\.config\kilo\tui.json` que el array `plugin`
   contiene la 4ª entrada `Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts`
   y que existe el backup `tui.json.backup-ktr`.
2. Abra una TUI nueva en un proyecto DIFERENTE (donde no instalaste nada local).
3. **Observar:** el plugin funciona (turno → toast) sin configuración local.
4. **Copiar:** extracto del `plugin` array de tui.json + toast de la nueva TUI.

## T15 — Offline (RF-09)

1. Desconecta la red (desactiva Wi-Fi / desconecta cable / corta el proxy).
2. Abre la TUI y ejecuta un turno. Nota: si el modelo requiere red, la
   RESPUESTA fallará — el objetivo es el recordatorio, no la respuesta.
3. **Observar:** el plugin sigue mostrando el toast del turno (aunque el
   estado del turno sea ERROR por la red) y escribe en `turns.jsonl`. Sin
   traceback ni crash del plugin.
4. **Copiar:** toast + línea de `turns.jsonl`. Reconecta la red después.

## T16 — Configuración (RF-16)

1. Edita temporalmente la entrada del plugin en `tui.json` para pasar
   opciones. Prueba A:
   ```json
   ["Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts", {"showNotifications": false}]
   ```
   (con `showNotifications:false` no hay toasts de sistema/attention).
2. Prueba B (desactivar por completo):
   ```json
   ["Z:/home/delac/proyectosIA/rembember_prompt/kilo-task-recall/src/index.ts", {"enabled": false}]
   ```
3. Tras cada cambio, reinicia la TUI.
4. **Observar:** A → comportamiento normal sin notificaciones extra de
   atención; B → ningún toast del plugin. También puedes probar
   `maxPromptDisplayLength`, `toastDurationMs`, `strictRouteMatch`.
5. **Copiar:** JSON usado y descripción del comportamiento.
6. **Restaurar:** deja la entrada original
   `"Z:/home/delac/.../src/index.ts"` (sin objeto de opciones) al terminar.

---

## Registro de resultados

Marca en `ralph/ACCEPTANCE.md` (sección C) cada prueba como
`MANUAL-PASS` solo si copiaste la evidencia, o deja `MANUAL-PENDIENTE` /
registra `FALLIDA` con lo observado en `ralph/ERRORS.md`.

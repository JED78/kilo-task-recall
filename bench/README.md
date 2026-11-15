# bench/ — Banco de pruebas contra Kilo REAL

Los scripts de este directorio validaron el plugin end-to-end contra instancias
reales de Kilo (no mocks): 13/16 escenarios de T01–T16 en PASS el 2026-11-14.
Resultados y evidencia en `ralph/ACCEPTANCE.md` §C.

## Cómo funcionan

1. `kilo serve` (servidores headless en puertos 15451/15452, un workdir distinto
   cada uno: `%TEMP%\opencode\ktr-t\A` y `...\B`).
2. `kilo attach http://127.0.0.1:<puerto>` — 2 TUIs headless que cargan el plugin
   desde el `tui.json` global (`%LOCALAPPDATA%\kilo-task-recall\turns.jsonl` es
   la evidencia que el plugin escribe).
3. `driver.mjs` — pilota el HTTP: crea sesiones, envía prompts (sincronos,
   con tools interactivas desactivadas), aborta, compacta.
4. `validate.mjs` — validador post-hoc sobre `turns.jsonl` (12/12 PASS).

## Uso (exploratorio, NO es CI)

Estos scripts son artefactos de laboratorio con rutas/puertos fijados en el
momento de la campaña; úsalos como base para tu propio banco, no como tests
automáticos. Pasos aproximados:

```
mkdir %TEMP%\opencode\ktr-t\A
cd /d %TEMP%\opencode\ktr-t\A
cmd /c kilo serve --port 15451 --print-logs
# en otra consola:
cmd /c kilo attach http://127.0.0.1:15451 --print-logs
node driver.mjs
node validate.mjs
```

Advertencias:
- Los prompts se envían al agente por defecto (`agent=code`) → desactiva tools
  interactivas (el driver ya lo hace: question/ask/task/webfetch off).
- `POST /session/{id}/message` es SÍNCRONO (2-4 min por prompt): usa timeouts
  ≥300 s o fire-and-poll.
- Un fallo PRE-LLM (modelo inexistente) nunca persiste AssistantMessage → el
  turno queda con `assistantMessageId: null` y estado `RESPUESTA FINALIZADA`
  (gap documentado en `ralph/ACCEPTANCE.md`).
- Deja la infraestructura limpia al terminar: mata los procesos `kilo serve`
  y `kilo attach` que hayas levantado.

# ERRORS — Kilo Task Recall

Formato: fecha | síntoma | causa raíz | solución | estado.

## Problemas conocidos del entorno (pre-proyecto, verificados)
- 2026-11-14 | `ralph.ps1` shim falla: "Bun is required" | spawnSync('bun') de Node no resuelve shims .cmd/.ps1 en C:\nvm4w\nodejs_v18\nodejs | invocar directamente: `bun "C:\nvm4w\nodejs_v18\nodejs\node_modules\@th0rgal\ralph-wiggum\ralph.ts" <args>` | RESUELTO (workaround permanente).
- 2026-11-14 | npm/cmd.exe falla con "No se permiten rutas UNC" en \\wsl.localhost\... | cmd.exe no soporta UNC como cwd | unidad Z: mapeada (net use Z: \\wsl.localhost\Ubuntu /persistent:no) y trabajar desde Z:\home\delac\... | RESUELTO. Ralph/debe trabajar en Z:.
- 2026-11-14 | `node --test tests/` (directorio) falla con MODULE_NOT_FOUND en UNC/Windows | resolución de dir de tests | usar patrón de archivos: `node --test tests/*.test.ts` | RESUELTO (script de package.json ya ajustado).
- 2026-11-14 (observado en plugin previo del usuario, NO de este proyecto) | remember-task-capture.ts: messageId siempre "desconocido" y captura mensajes sintéticos DCP como prompts | hook server sin acceso a parts/parentID | este proyecto NO usa server plugin: la TUI lee messages + parts reales y filtra synthetic/ignored | EVITADO POR DISEÑO.

## Errores durante el desarrollo

- 2026-11-14 | Ralph loop v1 falló 9 iteraciones seguidas sin ejecutar el agente: `TypeError: The argument 'args[2]' contains a cmd.exe special character and cannot be safely passed to a .bat/.cmd file` en `Bun.spawn` (ralph.ts:2050) en TODAS las iteraciones | `resolveCommand` resuelve `opencode` → shim `opencode.cmd` y Bun en Windows se niega a pasar argumentos con caracteres especiales de cmd.exe (`#`, comillas, acentos) a un .bat/.cmd; el prompt de iteración contiene `#` (headers markdown) | apuntar ralph al binario NATIVO vía env var `RALPH_OPENCODE_BINARY=C:\Users\delac\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe` (v1.18.26, 179MB; con un .exe Bun no aplica la restricción) | RESUELTO (loop relanzado). Estado previo intacto: ningún cambio en el proyecto (los fallos son previos al spawn del agente).

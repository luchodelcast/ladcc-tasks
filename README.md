# LADCC Tasks

Sistema personal de tareas de Luis Alberto Del Castillo Cadavid.

## Capas
- Google Sheet `Mis Tareas` — fuente de verdad estructurada (schema v3.1, 17 columnas).
- Apps Script `LADCC Tasks manager` — sync bidireccional Sheet ↔ Google Tasks cada 15 min.
- Google Tasks — 6 listas (Superlikers, LADCC, DCDG, LIH, La Isabella, DCC) como interfaz móvil/web.

## Estructura del repo
- `Code.js` — funciones de mantenimiento del Sheet (schema v3.1).
- `Sync_v2.1.js` — sync bidireccional Sheet ↔ Tasks (v2.2.1).
- `Endpoint.js` — DEPRECADO (ver sección abajo).
- `appsscript.json` — manifest del proyecto.

## Flujo de desarrollo
1. Edita en branch (`fix/`, `feat/`, `chore/`), abre PR a `main`.
2. Tras merge: `git pull` + `clasp push` desde la Mac de Luis.
3. Verificación final en el editor de Apps Script (navegador).

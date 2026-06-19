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

## Patrón canónico para webapps externas

Para crear tareas desde una webapp externa (CRM, Investor Hub, etc.),
usa el patrón Service Account con domain-wide delegation directo
contra `tasks.googleapis.com`. Ejemplo de referencia: CRM Superlikers
en `crm.superlikers.com` (Netlify Function con `google-auth-library`,
JWT impersonando `luis@iwin.im`, scope `auth/tasks`).

`Endpoint.js` (deprecado y eliminado del repo — ver el historial git del
archivo) era un webhook anterior vía Apps Script Web App. Está bloqueado
por la política del Workspace iwin.im y no debe usarse.

## Marcador `· meta` para webapps externas

Las webapps externas (CRM Superlikers, futuros Investor Hubs) crean tareas
en Google Tasks con `{title, notes, due}` solamente. Para enriquecer la
importación al Sheet con Categoría/Importancia/Urgencia, el frontend puede
escribir una línea final en `notes` con el marcador `· meta`. El sync la
parsea, la traduce a columnas del Sheet y la remueve de la descripción.

**Formato:** una sola línea al final de las notes, prefijo `· meta `, con
pares `clave=valor` separados por espacios.

```
[descripción del usuario]
· meta cat=Comercial imp=Alta urg=Pronto
```

- Claves válidas: `cat`, `imp`, `urg`.
- Valores sin espacios: usa guion bajo y el sync lo convierte
  (ej. `cat=Super_Meseros` → `Super Meseros` en el Sheet).
- Si falta una clave, esa columna queda vacía.

Tras la importación, la línea `· meta` se elimina de la descripción y la
tarea en Google Tasks queda con solo la huella `· LADCC-XXXX`.

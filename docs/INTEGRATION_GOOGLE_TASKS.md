# Contrato de integración — Google Tasks como hub (LADCC Tasks ↔ CeoDesk)

> **Estado:** especificación (v1). Este documento vive en el repo de **LADCC
> Tasks** y define el contrato que la sesión de **CeoDesk** debe implementar.
> Ninguna de las dos partes debe cambiar el formato de `notes`, el mapeo de
> estados ni las reglas anti-loop sin actualizar este documento primero.

## 1. Idea central

**Google Tasks es el hub compartido.** Ningún sistema es dueño único de las
tareas: ambos leen y escriben contra las 6 listas de Google Tasks, y cada uno
mantiene su propia proyección.

```
        CeoDesk  ──(Service Account: lee/escribe)──►  Google Tasks  ◄──(Sync v2.2.1)──►  Sheet "Mis Tareas"
  (interfaz principal de consulta)                   (6 listas)                     (fuente de verdad estructurada)
        ▲  captura rápida nativa (móvil/web) ────────┘
```

- **CeoDesk** = interfaz principal para **consultar** el trabajo de Luis
  (ítems nativos de CeoDesk + tareas de Google Tasks) y para **crear/editar**.
- **Google Tasks** = captura rápida nativa y punto de intercambio.
- **LADCC Tasks (Sheet + Apps Script)** = fuente de verdad estructurada
  personal; espeja Google Tasks ↔ Sheet cada 15 min.

## 2. Roles y fronteras

| | LADCC Tasks | CeoDesk |
|---|---|---|
| Dueño del **Sheet** | ✅ único | ❌ no toca el Sheet ni el Apps Script |
| Escribe en **Google Tasks** | ✅ (sync) | ✅ (Service Account) |
| Lee **Google Tasks** | ✅ (sync) | ✅ (las 6 listas) |
| Dueño del **mapeo categoría→lista** | ✅ (`MAPEO_CATEGORIA_A_LISTA` en `Sync_v2.1.js`) | consume/replica |
| Dueño de la **huella** `· LADCC-XXXX` | ✅ único (la escribe el sync) | preserva, nunca la inventa |

**Regla de oro:** CeoDesk **nunca** escribe en el Sheet ni en el Apps Script.
Toda la interacción es contra la API de Google Tasks.

## 3. Listas (decisión: las 6)

CeoDesk muestra en "Mi trabajo" las **6 listas**:

```
Superlikers · LADCC · DCDG · LIH · La Isabella · DCC
```

La vista es **per-user**: solo Luis ve sus tareas. Estas listas son el sistema
personal completo de Luis; conviven con los ítems nativos de CeoDesk (que viven
en Netlify Blobs, no en Google Tasks).

## 4. Formato de las `notes` (lo más crítico)

Las `notes` de una tarea de Google Tasks pueden contener, además del texto del
usuario, **una** línea de control especial al final. Solo puede haber **una**
línea de control al final, porque tanto la huella como el marcador `· meta` se
detectan con un regex **anclado al final de la cadena** (`$`).

### 4.1 La huella `· LADCC-XXXX` (la escribe LADCC)

Cuando el sync importa o crea una tarea, escribe al final de las notes:

```
\n· LADCC-1234
```

- Regex de detección (en `Sync_v2.1.js`): `/\n?·\s*(LADCC-\d+)\s*$/`.
- Es el mecanismo anti-duplicación **CAPA 1**: LADCC reconoce la tarea por esta
  huella aunque pierda su metadata.
- **CeoDesk NUNCA inventa una huella.** Solo la LEE (para mapear) y la
  **PRESERVA** al editar (§6.3).

### 4.2 El marcador `· meta` (lo escribe CeoDesk al crear)

Para enriquecer una tarea nueva con Categoría / Importancia / Urgencia, CeoDesk
escribe **como última línea**:

```
[descripción del usuario]
· meta cat=Comercial imp=Alta urg=Pronto
```

- Regex (en `Sync_v2.1.js`): `/\n?·\s*meta\s+([^\n]+)\s*$/`.
- Claves válidas: `cat`, `imp`, `urg`. Pares `clave=valor` separados por espacios.
- **Valores sin espacios:** usa guion bajo; el sync lo convierte
  (`cat=Super_Meseros` → `Super Meseros`).
- Si falta una clave, esa columna queda vacía en el Sheet.
- **Ciclo de vida:** en la siguiente importación, LADCC **consume** la línea
  `· meta` (la traduce a columnas del Sheet) y la **reemplaza por la huella**
  `· LADCC-XXXX`. Es decir: la línea `· meta` desaparece — es esperado. CeoDesk
  no debe depender de que siga ahí.

### 4.3 Orden y convivencia

- CeoDesk **no** añade su propio marcador (decisión: mapea por Google-Task-ID en
  sus Blobs). Esto mantiene las notes limpias y elimina el riesgo de romper el
  anclado al final.
- En estado estable, la **última** línea de una tarea sincronizada es la huella
  `· LADCC-XXXX`. En una tarea recién creada por CeoDesk y aún no importada, la
  última línea es `· meta ...`.
- **Nunca** debe haber una huella y un `· meta` compitiendo por el final: el flujo
  garantiza que `· meta` se consume y se sustituye por la huella.

### 4.4 Al mostrar la descripción

CeoDesk, al renderizar una tarea, debe **limpiar** ambas líneas de control antes
de mostrar la descripción:

```
descripcionVisible = notes
  .replace(/\n?·\s*meta\s+[^\n]+\s*$/, '')
  .replace(/\n?·\s*(LADCC-\d+)\s*$/, '')
  .replace(/\s+$/, '');
```

## 5. Autenticación

Ambos lados usan el **patrón Service Account** con domain-wide delegation,
impersonando `luis@iwin.im`, scope `https://www.googleapis.com/auth/tasks`,
directo contra `tasks.googleapis.com`. Referencia de implementación: CRM
Superlikers (Netlify Function con `google-auth-library`). Ver la sección
"Patrón canónico para webapps externas" del `README.md`.

## 6. Flujos

### 6.1 CeoDesk crea una tarea → Google Tasks → LADCC importa

1. CeoDesk crea la tarea vía Service Account con `{ title, notes, due }`.
   - `notes` = descripción + (opcional) última línea `· meta cat= imp= urg=`.
   - **Lista destino:** para evitar un "move" en el siguiente ciclo, crea la
     tarea en la lista que corresponde a la categoría (p. ej. ítems de negocio →
     `Superlikers`). Si no sabe la lista, créala en `Superlikers` y deja que
     LADCC la re-rutee por la categoría del `· meta` (§7). Acepta un move.
2. CeoDesk guarda en su store el `Google Task ID` ↔ su ítem nativo.
3. En ≤15 min, el sync de LADCC la importa: crea la fila `LADCC-XXXX`, traduce
   `· meta` a columnas, y **reemplaza** `· meta` por la huella.

### 6.2 Captura rápida en Google Tasks → LADCC + CeoDesk

1. Luis crea una tarea desde el móvil (Google Tasks), sin categoría.
2. LADCC la importa (default `Superlikers`, **respeta la lista actual** — no la
   arrastra a LADCC).
3. CeoDesk, al listar las 6 listas, la ve y la muestra. Si aún no la tenía
   mapeada, crea el mapeo por Google-Task-ID.

### 6.3 CeoDesk edita / completa una tarea (cualquiera)

Decisión: CeoDesk puede escribir sobre **todas** las tareas de Luis.

- **Completar:** `Tasks.patch({ status: 'completed', completed: <ISO> })`. El sync
  lo detecta y marca `Hecha` en el Sheet (`resolverTareaConocida`).
- **Editar notes/título/due:** permitido. **Regla dura:** al reescribir `notes`,
  **preservar intacta la línea final de huella** `· LADCC-XXXX` si existe. Si se
  borra, LADCC cae a CAPA 2 (match por título) — funciona, pero es peor. No la borres.
- No hace falta tocar metadata ni el Sheet: LADCC reconcilia por timestamps.

## 7. Mapeo categoría → lista (dueño: LADCC)

El mapa canónico vive en `Sync_v2.1.js` (`MAPEO_CATEGORIA_A_LISTA`) y su default
es `LISTA_DEFAULT = 'Superlikers'`. Reglas:

- Con `· meta cat=X`, LADCC pone categoría X en el Sheet y, en el siguiente
  ciclo, mueve la tarea a la lista mapeada para X (si difiere de la actual).
- **Sin categoría**, LADCC **respeta la lista actual** de Google Tasks (no mueve).
- Si CeoDesk quiere evitar el move, debe crear la tarea directamente en la lista
  mapeada. Si replica el mapa, este documento (y el código de LADCC) es la fuente;
  cualquier cambio se coordina aquí.

## 8. Mapeo de estados

| Google Tasks | Sheet (LADCC) | CeoDesk (Tarea) |
|---|---|---|
| `needsAction` | `Pendiente` / `En curso` | Por hacer / En curso |
| `completed` | `Hecha` (+ fecha completado) | Hecha |

- Google Tasks solo tiene 2 estados. Estados intermedios de CeoDesk
  (En curso, Bloqueada) **no** tienen representación nativa en Google Tasks: se
  mantienen en el store de CeoDesk. La tarea en Google Tasks sigue `needsAction`
  hasta que se completa.
- Completar en cualquier superficie (CeoDesk, Google Tasks, Sheet) se propaga a
  las demás vía el estado `completed`.

## 9. Reglas anti-loop y anti-duplicación

LADCC ya está endurecido (huella CAPA 1, match por título CAPA 2, cortacircuitos
CAPA 3, control de cuota). Lo que **CeoDesk debe respetar** para no romperlo:

1. **Mapear por Google-Task-ID**, no por título, para no crear ítems duplicados
   cuando LADCC modifica el título (prefijo de categoría) o las notes (huella).
2. **No borrar la huella** al editar (§6.3).
3. **No escribir en ráfaga** la misma tarea que se acaba de crear: espera a tener
   el Google-Task-ID de vuelta antes de re-patchear.
4. **No re-crear** una tarea que ya existe en Google Tasks porque no aparezca aún
   en el store: reconcilia primero por Google-Task-ID.
5. El sync de LADCC solo escribe a Google Tasks cuando el **Sheet** cambió; las
   ediciones de CeoDesk se propagan Tasks→Sheet, no generan eco. No hay loop
   mientras CeoDesk no reaccione re-escribiendo ante cada cambio que LADCC hace.

## 10. Checklist para la sesión de CeoDesk

- [ ] Service Account con domain-wide delegation, scope `auth/tasks`, impersona `luis@iwin.im`.
- [ ] Variables de entorno del SA en Netlify (no en el repo público).
- [ ] Listar las 6 listas y unificar en "Mi trabajo" (vista per-user de Luis).
- [ ] Al crear: `· meta cat= imp= urg=` como última línea; valores con `_` para espacios.
- [ ] Al mostrar: limpiar huella + `· meta` de la descripción (§4.4).
- [ ] Al editar: preservar la huella `· LADCC-XXXX`.
- [ ] Mapear Google-Task-ID ↔ ítem CeoDesk en Blobs; nunca por título.
- [ ] Completar vía `status: completed`; tolerar estados intermedios solo en el store.

## 11. Preguntas abiertas / futuro

- **Estados intermedios** (En curso / Bloqueada) sin representación en Google
  Tasks: ¿basta con el store de CeoDesk, o se codifican en el título/notes? (Hoy:
  solo en el store.)
- **Due/deadline bidireccional:** confirmar formato y zona horaria (LADCC usa
  `America/Bogota`).
- **Borrado:** si CeoDesk elimina una tarea de Google Tasks, LADCC la trata como
  "salió del filtro". Definir si CeoDesk debe borrar o solo completar.
- **Responsable ≠ Luis:** hoy LADCC solo sincroniza tareas cuyo responsable
  incluye a Luis. Ítems de CeoDesk asignados a terceros no entran a Google Tasks
  de Luis; eso es correcto por ahora.

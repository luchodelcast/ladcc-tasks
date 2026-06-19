/**
 * ============================================================================
 * LADCC Tasks Sync v2.2 — Multi-lista Google Tasks ↔ Mis Tareas
 * ============================================================================
 * Autor: Claude (asistente LADCC)
 * Fecha: 2026-05-23
 * Sheet: 1fBkNlQvNJRoQHyKP3Ke0lXzXnNChJtPTnIGEBhFsvVk
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ POR QUÉ EXISTE v2.2 — EL INCIDENTE DEL 23 DE MAYO                      │
 * │                                                                        │
 * │ v2.1 tenía un bug de bucle de duplicación. crearFilaDesdeTaskGoogle()  │
 * │ decidía "esta tarea es nueva" basándose SOLO en la hoja _Sync_Metadata.│
 * │ Cuando la metadata fallaba al escribirse (Sheet lleno a 10M celdas),   │
 * │ el sync NUNCA registraba la tarea, la veía "nueva" en cada ciclo, y    │
 * │ creaba otra fila. "Action items from my email" se duplicó 165 veces.   │
 * │ El Sheet llegó al límite de celdas y todo colapsó.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Cambios v2.1 → v2.2:
 *
 *   ANTI-DUPLICACIÓN (3 capas de defensa):
 *   1. CAPA 1 — Huella en la tarea de Google Tasks. Al importar/crear, se
 *      escribe una marca discreta en las notes: nueva línea "· LADCC-XXX".
 *      El sync lee esa marca para reconocer la tarea SIN depender de la
 *      metadata. La verdad viaja dentro de la propia tarea.
 *   2. CAPA 2 — Verificación contra el Sheet. Antes de crear una fila nueva,
 *      busca si ya existe una con título equivalente. Si existe, vincula.
 *   3. CAPA 3 — Cortacircuitos. Máximo MAX_CREACIONES_POR_CICLO creaciones
 *      por ejecución. Si se supera, aborta y alerta. Daño máximo acotado.
 *
 *   ROBUSTEZ:
 *   4. registrarLog() ya NO falla en silencio. Si no puede escribir el log,
 *      marca un flag y el sync ABORTA limpio en el siguiente checkpoint.
 *   5. Poda dura del log: MAX_LOG_FILAS (500), sin importar antigüedad.
 *      Se ejecuta SIEMPRE al final del sync, no condicionada a 30 días.
 *   6. inicializarEstructurasSync() NO pre-formatea miles de filas.
 *   7. Detección de error de cuota Tasks API: si aparece "Quota exceeded",
 *      el sync aborta de inmediato, NO reintenta, y registra el incidente.
 *   8. Trigger cada 15 min (antes 5) — 96 ciclos/día en vez de 288.
 *
 *   Compatible con Code.gs v3.2.0 (schema v3.1, 17 cols).
 *
 * REGLAS DE NEGOCIO (sin cambios respecto a v2.1):
 *   D1: Solo se sincronizan tareas con col Q (Sync a Tasks) = TRUE.
 *   D2: Híbrido al salir del filtro (Hecha/Archivar → completar;
 *       reasignación/Sync desmarcada → eliminar).
 *   D3: Prefijo de categoría en título: solo Sheet→Tasks.
 *   D4: Descripción ↔ notes bidireccional.
 *   D6: Metadata en hoja oculta _Sync_Metadata.
 *   Multi-lista: categoría → lista. 6 listas (v2.2.1):
 *     Superlikers, LADCC, DCDG, LIH, La Isabella, DCC.
 * ============================================================================
 */

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 1: CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const CFG_SYNC = {
  SHEET_ID:              '1fBkNlQvNJRoQHyKP3Ke0lXzXnNChJtPTnIGEBhFsvVk',
  SHEET_MAIN:            'Mis Tareas',
  SHEET_METADATA:        '_Sync_Metadata',
  SHEET_LOG:             'Log_Sync',
  SYNC_INTERVAL_MINUTES: 15,          // v2.2: era 5
  LOCK_TIMEOUT_MS:       30000,
  MAX_TITLE_LENGTH:      1024,
  MAX_NOTES_LENGTH:      8192,
  TIMESTAMP_TOLERANCE_MS: 1000,
  OWNER_NAME:            'Luis',
  // v2.2 — Parámetros de seguridad anti-duplicación y anti-inflado
  MAX_CREACIONES_POR_CICLO: 5,        // CAPA 3: cortacircuitos
  MAX_LOG_FILAS:            500       // poda dura del log
};

// La marca discreta que el sync escribe en las notes de Google Tasks (CAPA 1)
// Formato: una línea nueva al final de las notes, con un punto medio + ID.
const MARCA_PREFIJO = '· ';
const MARCA_REGEX   = /\n?·\s*(LADCC-\d+)\s*$/;   // detecta "· LADCC-123" al final

// Las 6 listas de Google Tasks (v2.2.1: se agregó DCC)
//   DCDG = Del Castillo Diazgranados (núcleo: Luis, Carolina, hijos)
//   DCC  = Del Castillo Cadavid (origen: padres, hermana, Valledupar)
const LISTAS_GOOGLE_TASKS = ['Superlikers', 'LADCC', 'DCDG', 'LIH', 'La Isabella', 'DCC'];
const LISTA_DEFAULT = 'Superlikers';

// Mapeo categoría → lista. Editable.
const MAPEO_CATEGORIA_A_LISTA = {
  // ─── Superlikers ───
  'HOT': 'Superlikers', 'Super Meseros': 'Superlikers',
  'SuperDroguistas': 'Superlikers', 'Super Droguistas': 'Superlikers',
  'EGO': 'Superlikers', 'EGO Olímpica': 'Superlikers', 'EGO Olimpica': 'Superlikers',
  'Olímpica': 'Superlikers', 'Olimpica': 'Superlikers', 'Coopidrogas': 'Superlikers',
  'OXXO': 'Superlikers', 'Engage': 'Superlikers',
  'Héroes OXXO': 'Superlikers', 'Heroes OXXO': 'Superlikers',
  'iHungo': 'Superlikers', 'GlobalSoft': 'Superlikers', 'Pangea': 'Superlikers',
  'Bavaria': 'Superlikers', 'AB InBev': 'Superlikers', 'FEMSA': 'Superlikers',
  'Modelo': 'Superlikers', 'Grupo Modelo': 'Superlikers', 'Unidrogas': 'Superlikers',
  'Royal Camp': 'Superlikers', 'Royal Films': 'Superlikers', 'Allianz': 'Superlikers',
  'Movistar': 'Superlikers', 'Kolbi': 'Superlikers', 'Endeavor': 'Superlikers',
  'MK Capital': 'Superlikers', 'Master Waiters': 'Superlikers', 'XGAIGE': 'Superlikers',
  'Investor Hub': 'Superlikers', 'Showcase': 'Superlikers',
  'Caribe Exponencial': 'Superlikers', 'Bancolombia': 'Superlikers',
  'Banco Bogotá': 'Superlikers', 'Banco de Bogotá': 'Superlikers',
  'Serfinanza': 'Superlikers',
  'Vinculación bancaria': 'Superlikers', 'Vinculacion bancaria': 'Superlikers',
  'iWin': 'Superlikers', 'iWin LLC': 'Superlikers', 'iWin SAS': 'Superlikers',
  'Income Tax': 'Superlikers', 'Delaware': 'Superlikers',
  'Operativa interna': 'Superlikers', 'Equipo': 'Superlikers',
  'RRHH': 'Superlikers', 'People': 'Superlikers', 'Legal': 'Superlikers',
  'Legal/Fiscal': 'Superlikers', 'Comercial': 'Superlikers',
  'Producto': 'Superlikers', 'Tech': 'Superlikers', 'Studio': 'Superlikers',
  'Retail Media': 'Superlikers', 'Fundraising': 'Superlikers',
  // ─── LADCC (personal) ───
  'Personal': 'LADCC', 'Salud': 'LADCC', 'Viajes': 'LADCC',
  'Tarea de prueba': 'LADCC', 'Test': 'LADCC',
  // ─── DCDG (Del Castillo Diazgranados — núcleo: Luis, Carolina, hijos) ───
  'Familia': 'DCDG', 'DCDG': 'DCDG', 'Hijos': 'DCDG',
  'Sebastián': 'DCDG', 'Sebastian': 'DCDG',
  'Luis Alberto': 'DCDG', 'Luhijo': 'DCDG', 'Luciano': 'DCDG',
  'Carolina': 'DCDG', 'Caro Diazgranados': 'DCDG', 'Pago colegio': 'DCDG',
  'Médico familia': 'DCDG', 'Medico familia': 'DCDG',
  // ─── DCC (Del Castillo Cadavid — familia de origen) ───
  'DCC': 'DCC', 'Padres': 'DCC', 'Marina': 'DCC', 'Alberto': 'DCC',
  'Diana': 'DCC', 'Hermana': 'DCC', 'Valledupar': 'DCC',
  // ─── LIH (Ladca International Holding / Sindamanoy) ───
  'LIH': 'LIH', 'Ladca': 'LIH', 'Ladca International Holding': 'LIH',
  'Sindamanoy': 'LIH', 'Chía': 'LIH', 'Chia': 'LIH',
  'Holding': 'LIH', 'Inmuebles': 'LIH',
  // ─── La Isabella ───
  'La Isabella': 'La Isabella', 'La Huerta': 'La Isabella',
  'Huerta': 'La Isabella', 'Magdalena': 'La Isabella'
};

// Columnas del schema v3.1
const COL_V31 = {
  HECHA: 1, ARCHIVAR: 2, ID: 3, TAREA: 4, DESCRIPCION: 5, DEADLINE: 6,
  IMPORTANCIA: 7, URGENCIA: 8, CATEGORIA: 9, ESTADO: 10, BLOQUEADO_POR: 11,
  EVENT_ID: 12, NOTAS: 13, RESPONSABLE: 14, BENEFICIARIO: 15,
  FECHA_COMPLETADO: 16, SYNC_A_TASKS: 17
};

// Columnas de _Sync_Metadata
const COL_META = {
  TASK_ID_LADCC: 1, TASK_ID_GOOGLE: 2, TASK_LIST_ID: 3,
  UPDATED_AT_SHEET: 4, UPDATED_AT_TASKS: 5, ROW_INDEX_CACHE: 6
};
const META_HEADERS = [
  'TaskID_LADCC', 'TaskID_Google', 'TaskList_ID',
  'UpdatedAtSheet', 'UpdatedAtTasks', 'RowIndexCache'
];
const LOG_HEADERS_V2 = [
  'Timestamp', 'Tipo', 'TaskID_LADCC', 'Lista', 'TaskID_Google', 'Detalle'
];

const ESTADO_TXT = {
  PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', BLOQUEADO: 'Bloqueado',
  HECHA: 'Hecha', CANCELADA: 'Cancelada'
};
const TASKS_STATUS = { NEEDS_ACTION: 'needsAction', COMPLETED: 'completed' };

const LOG_TYPE = {
  SYNC_OK: 'SYNC_OK', SETUP: 'SETUP', TEARDOWN: 'TEARDOWN', ERROR: 'ERROR',
  CREATE_TASK: 'CREATE_TASK', UPDATE_TASK: 'UPDATE_TASK',
  DELETE_TASK: 'DELETE_TASK', COMPLETE_TASK: 'COMPLETE_TASK',
  UPDATE_ROW: 'UPDATE_ROW', COMPLETE_ROW: 'COMPLETE_ROW',
  REOPEN_ROW: 'REOPEN_ROW', CONFLICT_TASKS_WINS: 'CONFLICT_TASKS_WINS',
  CONFLICT_SHEET_WINS: 'CONFLICT_SHEET_WINS', RESET: 'RESET',
  IMMEDIATE_CREATE: 'IMMEDIATE_CREATE', IMMEDIATE_DELETE: 'IMMEDIATE_DELETE',
  MOVE_LIST: 'MOVE_LIST', SKIP: 'SKIP',
  // v2.2 — tipos nuevos
  ABORT_QUOTA: 'ABORT_QUOTA',           // cuota Tasks API agotada
  ABORT_LOG_FAIL: 'ABORT_LOG_FAIL',     // no se pudo escribir el log
  ABORT_CIRCUIT: 'ABORT_CIRCUIT',       // cortacircuitos de creaciones
  LINK_EXISTING: 'LINK_EXISTING',       // CAPA 2: vinculó en vez de duplicar
  RECOGNIZED_MARK: 'RECOGNIZED_MARK'    // CAPA 1: reconoció por huella
};

const PROP_KEY = {
  LAST_SYNC: 'LADCC_SYNC_LAST_RUN',
  SYNC_IN_PROGRESS: 'LADCC_SYNC_IN_PROGRESS'
};

// Estado de aborto del ciclo actual (se reinicia en cada syncTasks)
var SYNC_ABORT = { activo: false, razon: '' };


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 2: SYNC PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

function syncTasks() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CFG_SYNC.LOCK_TIMEOUT_MS)) {
    console.log('Sync ya en curso, omitiendo esta corrida');
    return;
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEY.SYNC_IN_PROGRESS, 'true');

  // v2.2: reiniciar estado de aborto al inicio de cada ciclo
  SYNC_ABORT = { activo: false, razon: '' };
  let creacionesEsteCiclo = 0;

  try {
    inicializarEstructurasSync();
    if (SYNC_ABORT.activo) {
      console.error('Sync abortado en inicialización: ' + SYNC_ABORT.razon);
      return;
    }

    const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);
    const sheet = ss.getSheetByName(CFG_SYNC.SHEET_MAIN);

    // BLOQUE 2.0: obtener listas — primer punto donde puede fallar la cuota
    let listasMap;
    try {
      listasMap = obtenerOCrearTodasLasListas();
    } catch (e) {
      if (esErrorDeCuota(e)) {
        registrarLog(LOG_TYPE.ABORT_QUOTA, '', '', '',
          'Cuota Tasks API agotada al listar listas. Sync abortado sin reintentar.');
        console.error('ABORT: cuota Tasks API agotada.');
        return;
      }
      throw e;
    }

    const lastSync = obtenerUltimoSync();
    const ahora = new Date();

    // BLOQUE 2.1: Snapshot de ambos lados
    let tareasGoogle;
    try {
      tareasGoogle = listarTareasDeTodasLasListas(listasMap);
    } catch (e) {
      if (esErrorDeCuota(e)) {
        registrarLog(LOG_TYPE.ABORT_QUOTA, '', '', '',
          'Cuota Tasks API agotada al listar tareas. Sync abortado.');
        return;
      }
      throw e;
    }

    const filasSheet = leerTareasSheetSincronizables(sheet);
    const metadata = leerMetadata(ss);

    const stats = {
      creadas: 0, actualizadas: 0, eliminadas: 0, completadas: 0,
      movidas: 0, conflictos: 0, errores: 0, skip: 0,
      vinculadas: 0, reconocidas: 0
    };

    // BLOQUE 2.2: Google Tasks → Sheet
    for (let ti = 0; ti < tareasGoogle.length; ti++) {
      if (SYNC_ABORT.activo) break;

      const taskInfo = tareasGoogle[ti];
      const taskGoogle = taskInfo.task;
      const taskListId = taskInfo.taskListId;

      // CAPA 1: ¿la tarea trae huella "· LADCC-XXX" en sus notes?
      const idEnHuella = extraerIdDeHuella(taskGoogle.notes);

      // Buscar metadata: primero por Google ID, luego por la huella
      let meta = metadata.byGoogleId.get(taskGoogle.id);
      if (!meta && idEnHuella) {
        meta = metadata.byLadccId.get(idEnHuella);
        if (meta) {
          // La huella reconectó una tarea que la metadata había perdido.
          meta.taskIdGoogle = taskGoogle.id;
          upsertMetadata(ss, meta.taskIdLadcc, taskGoogle.id, taskListId,
            meta.updatedAtSheet, new Date(taskGoogle.updated), meta.rowIndexCache);
          metadata.byGoogleId.set(taskGoogle.id, meta);
          registrarLog(LOG_TYPE.RECOGNIZED_MARK, meta.taskIdLadcc, '',
            taskGoogle.id, 'Reconocida por huella en notes (CAPA 1)');
          stats.reconocidas++;
        }
      }

      if (!meta) {
        // No hay metadata NI huella. Candidata a "creada desde el móvil".
        // CAPA 2: verificar contra el Sheet antes de crear.
        const filaExistente = buscarFilaPorTitulo(
          sheet, limpiarPrefijoSiExiste(limpiarHuella(taskGoogle.title)));
        if (filaExistente) {
          // Ya existe una fila con ese título. Vincular, NO duplicar.
          vincularTareaExistente(ss, sheet, filaExistente, taskGoogle, taskListId);
          stats.vinculadas++;
          continue;
        }

        // CAPA 3: cortacircuitos
        if (creacionesEsteCiclo >= CFG_SYNC.MAX_CREACIONES_POR_CICLO) {
          SYNC_ABORT.activo = true;
          SYNC_ABORT.razon = 'Cortacircuitos: se alcanzó el máximo de ' +
            CFG_SYNC.MAX_CREACIONES_POR_CICLO + ' creaciones por ciclo';
          registrarLog(LOG_TYPE.ABORT_CIRCUIT, '', '', taskGoogle.id,
            SYNC_ABORT.razon + '. Sync detenido para evitar duplicación masiva.');
          break;
        }

        try {
          crearFilaDesdeTaskGoogle(sheet, taskGoogle, taskListId, ss);
          creacionesEsteCiclo++;
          stats.creadas++;
        } catch (e) {
          if (esErrorDeCuota(e)) {
            SYNC_ABORT.activo = true;
            SYNC_ABORT.razon = 'Cuota Tasks API agotada';
            registrarLog(LOG_TYPE.ABORT_QUOTA, '', '', taskGoogle.id,
              'Cuota agotada al crear fila. Sync abortado.');
            break;
          }
          registrarLog(LOG_TYPE.ERROR, '', '', taskGoogle.id,
            'Error creando fila desde Tasks: ' + e.message);
          stats.errores++;
        }
        continue;
      }

      // Tarea conocida: resolver cambios bidireccionales
      try {
        const resultado = resolverTareaConocida(
          sheet, taskListId, taskGoogle, meta, lastSync, ss, listasMap);
        if (resultado === 'UPDATED') stats.actualizadas++;
        else if (resultado === 'CONFLICT') stats.conflictos++;
        else if (resultado === 'COMPLETED') stats.completadas++;
        else if (resultado === 'MOVED') stats.movidas++;
        else if (resultado === 'SKIP') stats.skip++;
      } catch (e) {
        if (esErrorDeCuota(e)) {
          SYNC_ABORT.activo = true; SYNC_ABORT.razon = 'Cuota Tasks API agotada';
          registrarLog(LOG_TYPE.ABORT_QUOTA, meta.taskIdLadcc, '', taskGoogle.id,
            'Cuota agotada al resolver. Sync abortado.');
          break;
        }
        registrarLog(LOG_TYPE.ERROR, meta.taskIdLadcc, '', taskGoogle.id,
          'Error resolviendo: ' + e.message);
        stats.errores++;
      }
    }

    // BLOQUE 2.3: Sheet → Google Tasks (filas con Sync=TRUE sin contraparte)
    if (!SYNC_ABORT.activo) {
      for (let fi = 0; fi < filasSheet.length; fi++) {
        if (SYNC_ABORT.activo) break;
        const fila = filasSheet[fi];
        if (!estaEnFiltroSync(fila)) continue;
        const meta = metadata.byLadccId.get(fila.idLadcc);
        if (meta && meta.taskIdGoogle) continue; // ya existe

        if (creacionesEsteCiclo >= CFG_SYNC.MAX_CREACIONES_POR_CICLO) {
          SYNC_ABORT.activo = true;
          SYNC_ABORT.razon = 'Cortacircuitos en Sheet→Tasks';
          registrarLog(LOG_TYPE.ABORT_CIRCUIT, fila.idLadcc, '', '',
            'Cortacircuitos: máx creaciones por ciclo alcanzado.');
          break;
        }

        try {
          const lista = obtenerListaParaCategoria(fila.categoria, listasMap);
          crearTaskDesdeFila(sheet, fila, lista.id, lista.title, ss);
          creacionesEsteCiclo++;
          stats.creadas++;
        } catch (e) {
          if (esErrorDeCuota(e)) {
            SYNC_ABORT.activo = true; SYNC_ABORT.razon = 'Cuota Tasks API agotada';
            registrarLog(LOG_TYPE.ABORT_QUOTA, fila.idLadcc, '', '',
              'Cuota agotada al crear Task. Sync abortado.');
            break;
          }
          registrarLog(LOG_TYPE.ERROR, fila.idLadcc, '', '',
            'Error creando Task: ' + e.message);
          stats.errores++;
        }
      }
    }

    // BLOQUE 2.4: Filas que salieron del filtro (D2 híbrido)
    if (!SYNC_ABORT.activo) {
      for (let mi = 0; mi < metadata.todas.length; mi++) {
        if (SYNC_ABORT.activo) break;
        const meta = metadata.todas[mi];
        if (!meta.taskIdGoogle) continue;
        const fila = filasSheet.find(f => f.idLadcc === meta.taskIdLadcc);

        if (!fila) {
          try {
            eliminarTaskDeGoogle(meta.taskListId, meta.taskIdGoogle);
            eliminarMetadata(ss, meta.taskIdLadcc);
            registrarLog(LOG_TYPE.DELETE_TASK, meta.taskIdLadcc, '',
              meta.taskIdGoogle, 'Fila ya no existe en Mis Tareas');
            stats.eliminadas++;
          } catch (e) {
            if (esErrorDeCuota(e)) {
              SYNC_ABORT.activo = true; SYNC_ABORT.razon = 'Cuota Tasks API agotada';
              break;
            }
            registrarLog(LOG_TYPE.ERROR, meta.taskIdLadcc, '',
              meta.taskIdGoogle, 'Error eliminando: ' + e.message);
            stats.errores++;
          }
          continue;
        }

        if (estaEnFiltroSync(fila)) continue;

        try {
          aplicarSalidaDelFiltro(sheet, meta.taskListId, fila, meta, ss);
          if (fila.hecha || fila.archivar) stats.completadas++;
          else stats.eliminadas++;
        } catch (e) {
          if (esErrorDeCuota(e)) {
            SYNC_ABORT.activo = true; SYNC_ABORT.razon = 'Cuota Tasks API agotada';
            break;
          }
          registrarLog(LOG_TYPE.ERROR, meta.taskIdLadcc, '', meta.taskIdGoogle,
            'Error en salida del filtro: ' + e.message);
          stats.errores++;
        }
      }
    }

    // BLOQUE 2.5: Cierre del ciclo
    if (!SYNC_ABORT.activo) {
      guardarUltimoSync(ahora);
    }
    const resumen =
      'Tasks=' + tareasGoogle.length +
      ', EnFiltro=' + filasSheet.filter(estaEnFiltroSync).length +
      ', Creadas=' + stats.creadas + ', Vinculadas=' + stats.vinculadas +
      ', Reconocidas=' + stats.reconocidas + ', Actualizadas=' + stats.actualizadas +
      ', Completadas=' + stats.completadas + ', Eliminadas=' + stats.eliminadas +
      ', Movidas=' + stats.movidas + ', Conflictos=' + stats.conflictos +
      ', Errores=' + stats.errores +
      (SYNC_ABORT.activo ? ' [ABORTADO: ' + SYNC_ABORT.razon + ']' : '');
    registrarLog(SYNC_ABORT.activo ? LOG_TYPE.ERROR : LOG_TYPE.SYNC_OK,
      '', '', '', resumen);

    // v2.2: poda dura del log SIEMPRE
    podarLogDuro();

  } catch (err) {
    registrarLog(LOG_TYPE.ERROR, '', '', '', 'Sync abortado por excepción: ' + err.message);
    throw err;
  } finally {
    props.deleteProperty(PROP_KEY.SYNC_IN_PROGRESS);
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 3: SYNC INMEDIATO (Momento A — al marcar checkbox Q)
// ═══════════════════════════════════════════════════════════════════════════

function syncInmediato(rowIndex) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CFG_SYNC.LOCK_TIMEOUT_MS / 3)) {
    console.log('Sync en curso, sync inmediato pospuesto');
    return;
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEY.SYNC_IN_PROGRESS, 'true');
  SYNC_ABORT = { activo: false, razon: '' };

  try {
    inicializarEstructurasSync();
    if (SYNC_ABORT.activo) return;

    const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);
    const sheet = ss.getSheetByName(CFG_SYNC.SHEET_MAIN);

    let listasMap;
    try {
      listasMap = obtenerOCrearTodasLasListas();
    } catch (e) {
      if (esErrorDeCuota(e)) {
        registrarLog(LOG_TYPE.ABORT_QUOTA, '', '', '',
          'Sync inmediato abortado: cuota Tasks API agotada.');
        return;
      }
      throw e;
    }

    const fila = leerFilaIndividual(sheet, rowIndex);
    if (!fila) return;

    const metadata = leerMetadata(ss);
    const meta = metadata.byLadccId.get(fila.idLadcc);

    if (estaEnFiltroSync(fila)) {
      if (!meta || !meta.taskIdGoogle) {
        const lista = obtenerListaParaCategoria(fila.categoria, listasMap);
        crearTaskDesdeFila(sheet, fila, lista.id, lista.title, ss);
        registrarLog(LOG_TYPE.IMMEDIATE_CREATE, fila.idLadcc, lista.title,
          '', 'Activación inmediata: tarea creada');
      }
    } else {
      if (meta && meta.taskIdGoogle) {
        aplicarSalidaDelFiltro(sheet, meta.taskListId, fila, meta, ss);
        registrarLog(LOG_TYPE.IMMEDIATE_DELETE, fila.idLadcc, '',
          meta.taskIdGoogle, 'Activación inmediata: tarea sale del filtro');
      }
    }
  } catch (err) {
    if (esErrorDeCuota(err)) {
      registrarLog(LOG_TYPE.ABORT_QUOTA, '', '', '',
        'Sync inmediato: cuota Tasks API agotada.');
    } else {
      registrarLog(LOG_TYPE.ERROR, '', '', '', 'Sync inmediato: ' + err.message);
    }
  } finally {
    props.deleteProperty(PROP_KEY.SYNC_IN_PROGRESS);
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 4: DETECCIÓN DE ERROR DE CUOTA  (v2.2)
// ═══════════════════════════════════════════════════════════════════════════
//
// Reconoce el GoogleJsonResponseException de cuota agotada de Tasks API.
// Cuando esto pasa, el sync NO debe reintentar — solo abortar limpio.

function esErrorDeCuota(error) {
  if (!error) return false;
  const msg = String(error.message || error || '').toLowerCase();
  return msg.indexOf('quota exceeded') !== -1 ||
         msg.indexOf('quota metric') !== -1 ||
         msg.indexOf('rate limit') !== -1 ||
         msg.indexOf('userratelimitexceeded') !== -1 ||
         msg.indexOf('dailylimitexceeded') !== -1;
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 5: HUELLA EN NOTES  (CAPA 1 anti-duplicación, v2.2)
// ═══════════════════════════════════════════════════════════════════════════
//
// La huella es una línea discreta al final de las notes de la tarea de
// Google Tasks: "· LADCC-123". Permite que el sync reconozca una tarea
// aunque la metadata se haya perdido o corrompido.

// Extrae el ID LADCC de la huella, si existe. Devuelve 'LADCC-123' o null.
function extraerIdDeHuella(notes) {
  if (!notes) return null;
  const m = String(notes).match(MARCA_REGEX);
  return m ? m[1] : null;
}

// Quita la línea de huella de un texto de notes, devuelve las notes "limpias".
function limpiarHuella(notes) {
  if (!notes) return '';
  return String(notes).replace(MARCA_REGEX, '').replace(/\s+$/, '');
}

// Quita la huella de un título (por si quedó pegada por error).
function limpiarHuellaDeTitulo(titulo) {
  if (!titulo) return '';
  return String(titulo).replace(MARCA_REGEX, '').trim();
}

// Construye las notes finales = descripción del usuario + línea de huella.
function componerNotesConHuella(descripcion, idLadcc) {
  const base = limpiarHuella(descripcion || '');
  const huella = '\n' + MARCA_PREFIJO + idLadcc;
  let resultado = base ? (base + huella) : (MARCA_PREFIJO + idLadcc);
  if (resultado.length > CFG_SYNC.MAX_NOTES_LENGTH) {
    // recortar la base, nunca la huella
    const espacioHuella = huella.length;
    resultado = base.substring(0, CFG_SYNC.MAX_NOTES_LENGTH - espacioHuella) + huella;
  }
  return resultado;
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 6: LECTURA DEL SHEET
// ═══════════════════════════════════════════════════════════════════════════

function leerTareasSheetSincronizables(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const datos = sheet.getRange(2, 1, lastRow - 1, 17).getValues();
  const tareas = [];
  datos.forEach((row, idx) => {
    const idLadcc = String(row[COL_V31.ID - 1] || '').trim();
    if (!idLadcc) return;
    tareas.push(filaDesdeRow(idx + 2, row));
  });
  return tareas;
}

function leerFilaIndividual(sheet, rowIndex) {
  if (rowIndex < 2) return null;
  const row = sheet.getRange(rowIndex, 1, 1, 17).getValues()[0];
  const idLadcc = String(row[COL_V31.ID - 1] || '').trim();
  if (!idLadcc) return null;
  return filaDesdeRow(rowIndex, row);
}

function filaDesdeRow(rowIndex, row) {
  return {
    rowIndex:    rowIndex,
    idLadcc:     String(row[COL_V31.ID - 1] || '').trim(),
    hecha:       row[COL_V31.HECHA - 1] === true,
    archivar:    row[COL_V31.ARCHIVAR - 1] === true,
    tarea:       String(row[COL_V31.TAREA - 1] || ''),
    descripcion: String(row[COL_V31.DESCRIPCION - 1] || ''),
    deadline:    row[COL_V31.DEADLINE - 1],
    categoria:   String(row[COL_V31.CATEGORIA - 1] || '').trim(),
    estado:      String(row[COL_V31.ESTADO - 1] || '').trim(),
    responsable: String(row[COL_V31.RESPONSABLE - 1] || ''),
    syncATasks:  row[COL_V31.SYNC_A_TASKS - 1] === true
  };
}

function estaEnFiltroSync(fila) {
  if (!fila.syncATasks) return false;
  if (fila.hecha) return false;
  if (fila.archivar) return false;
  if (fila.estado === ESTADO_TXT.HECHA) return false;
  if (fila.estado === ESTADO_TXT.CANCELADA) return false;
  if (!responsableIncluyeOwner(fila.responsable)) return false;
  return true;
}

function responsableIncluyeOwner(valorResponsable) {
  if (!valorResponsable) return false;
  const normalizar = s => String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const owner = normalizar(CFG_SYNC.OWNER_NAME);
  const partes = valorResponsable.split(/[,;]/).map(normalizar);
  return partes.some(p => p === owner ||
    p.startsWith(owner + ' ') || p.endsWith(' ' + owner) ||
    p.indexOf(' ' + owner + ' ') !== -1);
}

// Encuentra primera fila vacía buscando por col C (ID). Reemplaza appendRow.
function encontrarPrimeraFilaVacia(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  const ids = sheet.getRange(2, COL_V31.ID, lastRow - 1, 1).getValues();
  let ultimaConDatos = 1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() !== '') ultimaConDatos = i + 2;
  }
  return ultimaConDatos + 1;
}

function buscarFilaPorIdLadcc(sheet, idLadcc) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, COL_V31.ID, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === idLadcc) {
      return leerFilaIndividual(sheet, i + 2);
    }
  }
  return null;
}

// CAPA 2: busca una fila por título de tarea (normalizado). Devuelve fila o null.
function buscarFilaPorTitulo(sheet, tituloBuscado) {
  const objetivo = normalizarTitulo(tituloBuscado);
  if (!objetivo) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const datos = sheet.getRange(2, 1, lastRow - 1, 17).getValues();
  for (let i = 0; i < datos.length; i++) {
    const idLadcc = String(datos[i][COL_V31.ID - 1] || '').trim();
    if (!idLadcc) continue;
    const titulo = normalizarTitulo(String(datos[i][COL_V31.TAREA - 1] || ''));
    if (titulo && titulo === objetivo) {
      return filaDesdeRow(i + 2, datos[i]);
    }
  }
  return null;
}

function normalizarTitulo(t) {
  return String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 7: METADATA
// ═══════════════════════════════════════════════════════════════════════════

function leerMetadata(ss) {
  const meta = ss.getSheetByName(CFG_SYNC.SHEET_METADATA);
  if (!meta) return { todas: [], byLadccId: new Map(), byGoogleId: new Map() };
  const lastRow = meta.getLastRow();
  if (lastRow < 2) {
    return { todas: [], byLadccId: new Map(), byGoogleId: new Map() };
  }
  const datos = meta.getRange(2, 1, lastRow - 1, META_HEADERS.length).getValues();
  const todas = [];
  const byLadccId = new Map();
  const byGoogleId = new Map();
  datos.forEach((row, idx) => {
    const taskIdLadcc = String(row[COL_META.TASK_ID_LADCC - 1] || '').trim();
    if (!taskIdLadcc) return;
    const obj = {
      rowIndexMeta:   idx + 2,
      taskIdLadcc:    taskIdLadcc,
      taskIdGoogle:   String(row[COL_META.TASK_ID_GOOGLE - 1] || '').trim(),
      taskListId:     String(row[COL_META.TASK_LIST_ID - 1] || '').trim(),
      updatedAtSheet: row[COL_META.UPDATED_AT_SHEET - 1] instanceof Date
                        ? row[COL_META.UPDATED_AT_SHEET - 1] : null,
      updatedAtTasks: row[COL_META.UPDATED_AT_TASKS - 1] instanceof Date
                        ? row[COL_META.UPDATED_AT_TASKS - 1] : null,
      rowIndexCache:  Number(row[COL_META.ROW_INDEX_CACHE - 1]) || null
    };
    todas.push(obj);
    byLadccId.set(taskIdLadcc, obj);
    if (obj.taskIdGoogle) byGoogleId.set(obj.taskIdGoogle, obj);
  });
  return { todas, byLadccId, byGoogleId };
}

function upsertMetadata(ss, taskIdLadcc, taskIdGoogle, taskListId,
                        updatedAtSheet, updatedAtTasks, rowIndexCache) {
  const meta = ss.getSheetByName(CFG_SYNC.SHEET_METADATA);
  if (!meta) return;
  const datos = meta.getLastRow() > 1
    ? meta.getRange(2, 1, meta.getLastRow() - 1, META_HEADERS.length).getValues()
    : [];
  let foundRow = -1;
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][COL_META.TASK_ID_LADCC - 1]).trim() === taskIdLadcc) {
      foundRow = i + 2; break;
    }
  }
  const valores = [
    taskIdLadcc, taskIdGoogle || '', taskListId || '',
    updatedAtSheet || '', updatedAtTasks || '', rowIndexCache || ''
  ];
  if (foundRow > 0) {
    meta.getRange(foundRow, 1, 1, META_HEADERS.length).setValues([valores]);
  } else {
    const lastRow = meta.getLastRow();
    let targetRow = lastRow + 1;
    if (lastRow > 1) {
      const idsM = meta.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idsM.length; i++) {
        if (!String(idsM[i][0] || '').trim()) { targetRow = i + 2; break; }
      }
    } else {
      targetRow = 2;
    }
    meta.getRange(targetRow, 1, 1, META_HEADERS.length).setValues([valores]);
  }
}

function eliminarMetadata(ss, taskIdLadcc) {
  const meta = ss.getSheetByName(CFG_SYNC.SHEET_METADATA);
  if (!meta) return;
  const lastRow = meta.getLastRow();
  if (lastRow < 2) return;
  const ids = meta.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === taskIdLadcc) {
      meta.deleteRow(i + 2); return;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 8: GOOGLE TASKS API — MULTI-LISTA
// ═══════════════════════════════════════════════════════════════════════════

function obtenerOCrearTodasLasListas() {
  const listasExistentes = Tasks.Tasklists.list().items || [];
  const mapa = {};
  LISTAS_GOOGLE_TASKS.forEach(nombre => {
    let existente = listasExistentes.find(l => l.title === nombre);
    if (!existente) {
      existente = Tasks.Tasklists.insert({ title: nombre });
    }
    mapa[nombre] = { id: existente.id, title: existente.title };
  });
  return mapa;
}

function obtenerListaParaCategoria(categoria, listasMap) {
  const cat = String(categoria || '').trim();
  if (!cat) return listasMap[LISTA_DEFAULT];
  const normalizar = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const catNorm = normalizar(cat);
  for (const clave in MAPEO_CATEGORIA_A_LISTA) {
    if (normalizar(clave) === catNorm) {
      const n = MAPEO_CATEGORIA_A_LISTA[clave];
      if (listasMap[n]) return listasMap[n];
    }
  }
  for (const clave in MAPEO_CATEGORIA_A_LISTA) {
    if (catNorm.indexOf(normalizar(clave)) !== -1) {
      const n = MAPEO_CATEGORIA_A_LISTA[clave];
      if (listasMap[n]) return listasMap[n];
    }
  }
  return listasMap[LISTA_DEFAULT];
}

function listarTareasDeTodasLasListas(listasMap) {
  const items = [];
  for (const nombre in listasMap) {
    const lista = listasMap[nombre];
    let pageToken = null;
    do {
      const resp = Tasks.Tasks.list(lista.id, {
        maxResults: 100, showCompleted: true, showHidden: true,
        showDeleted: false, pageToken: pageToken
      });
      if (resp.items) {
        resp.items.forEach(t => items.push({
          task: t, taskListId: lista.id, taskListName: nombre
        }));
      }
      pageToken = resp.nextPageToken;
    } while (pageToken);
  }
  return items;
}

function eliminarTaskDeGoogle(taskListId, taskId) {
  Tasks.Tasks.remove(taskListId, taskId);
}

function completarTaskEnGoogle(taskListId, taskId) {
  return Tasks.Tasks.patch({
    id: taskId, status: TASKS_STATUS.COMPLETED,
    completed: new Date().toISOString()
  }, taskListId, taskId);
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 9: CREACIÓN — SHEET → GOOGLE TASKS
// ═══════════════════════════════════════════════════════════════════════════

function crearTaskDesdeFila(sheet, fila, taskListId, taskListName, ss) {
  const titulo = construirTituloConPrefijo(fila.tarea, fila.categoria);
  const taskBody = {
    title: titulo.substring(0, CFG_SYNC.MAX_TITLE_LENGTH),
    status: TASKS_STATUS.NEEDS_ACTION,
    // CAPA 1: la huella va desde el inicio en las notes
    notes: componerNotesConHuella(fila.descripcion, fila.idLadcc)
  };
  const dueFormat = formatearFechaParaGoogleTasks(fila.deadline);
  if (dueFormat) taskBody.due = dueFormat;

  const taskCreada = Tasks.Tasks.insert(taskBody, taskListId);
  upsertMetadata(ss, fila.idLadcc, taskCreada.id, taskListId,
    new Date(), new Date(taskCreada.updated), fila.rowIndex);
  registrarLog(LOG_TYPE.CREATE_TASK, fila.idLadcc, taskListName, taskCreada.id,
    '"' + fila.tarea + '" creada en lista ' + taskListName);
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 10: CREACIÓN — GOOGLE TASKS → SHEET
// ═══════════════════════════════════════════════════════════════════════════
//
// Importa una tarea creada desde el móvil. v2.2: inmediatamente después de
// crear la fila, ESCRIBE LA HUELLA en las notes de la tarea de Google Tasks
// (CAPA 1) para que nunca se vuelva a importar como nueva.

/**
 * Extrae el marcador "· meta cat=X imp=Y urg=Z" de las notes de una
 * tarea de Google Tasks. Devuelve { cat, imp, urg, notesLimpias }.
 * notesLimpias son las notes sin esa línea (lista para escribir en
 * la columna Descripción del Sheet).
 *
 * Si no hay marcador, devuelve { cat:'', imp:'', urg:'',
 * notesLimpias: notes }.
 */
function extraerMetaDeNotes(notes) {
  if (!notes) return { cat:'', imp:'', urg:'', notesLimpias:'' };
  const regex = /\n?·\s*meta\s+([^\n]+)\s*$/;
  const match = String(notes).match(regex);
  if (!match) return { cat:'', imp:'', urg:'', notesLimpias: notes };

  const pares = match[1].trim().split(/\s+/);
  const meta = { cat:'', imp:'', urg:'' };
  for (const par of pares) {
    const [clave, valor] = par.split('=');
    if (!clave || !valor) continue;
    const valorLimpio = valor.replace(/_/g, ' ').trim();
    if (clave === 'cat') meta.cat = valorLimpio;
    else if (clave === 'imp') meta.imp = valorLimpio;
    else if (clave === 'urg') meta.urg = valorLimpio;
  }
  meta.notesLimpias = String(notes).replace(regex, '').replace(/\s+$/, '');
  return meta;
}

function crearFilaDesdeTaskGoogle(sheet, taskGoogle, taskListId, ss) {
  const targetRow = encontrarPrimeraFilaVacia(sheet);
  const nuevoId = generarSiguienteIdLadcc(sheet);

  if (sheet.getMaxRows() < targetRow) {
    sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows() + 5);
  }
  sheet.getRange(targetRow, COL_V31.HECHA).insertCheckboxes();
  sheet.getRange(targetRow, COL_V31.ARCHIVAR).insertCheckboxes();
  sheet.getRange(targetRow, COL_V31.SYNC_A_TASKS).insertCheckboxes();

  // Task 3: parsear el marcador "· meta cat=X imp=Y urg=Z" de las notes
  // para enriquecer la importación (Categoría/Importancia/Urgencia). Las
  // notesLimpias quedan sin esa línea, listas para la columna Descripción.
  const metaNotes = extraerMetaDeNotes(taskGoogle.notes || '');
  const notasLimpias = limpiarHuella(metaNotes.notesLimpias);

  const valores = new Array(17).fill('');
  valores[COL_V31.HECHA - 1]            = false;
  valores[COL_V31.ARCHIVAR - 1]         = false;
  valores[COL_V31.ID - 1]               = nuevoId;
  valores[COL_V31.TAREA - 1]            = limpiarPrefijoSiExiste(
                                            limpiarHuellaDeTitulo(taskGoogle.title || ''));
  valores[COL_V31.DESCRIPCION - 1]      = notasLimpias;
  valores[COL_V31.IMPORTANCIA - 1]      = metaNotes.imp;
  valores[COL_V31.URGENCIA - 1]         = metaNotes.urg;
  valores[COL_V31.CATEGORIA - 1]        = metaNotes.cat;
  valores[COL_V31.DEADLINE - 1]         = parsearFechaDesdeGoogleTasks(taskGoogle.due);
  valores[COL_V31.ESTADO - 1]           = taskGoogle.status === TASKS_STATUS.COMPLETED
                                            ? ESTADO_TXT.HECHA : ESTADO_TXT.PENDIENTE;
  valores[COL_V31.RESPONSABLE - 1]      = CFG_SYNC.OWNER_NAME;
  valores[COL_V31.FECHA_COMPLETADO - 1] = taskGoogle.status === TASKS_STATUS.COMPLETED
                                            ? new Date() : '';
  valores[COL_V31.SYNC_A_TASKS - 1]     = true;

  sheet.getRange(targetRow, 1, 1, 17).setValues([valores]);

  // CAPA 1: escribir la huella en la tarea de Google Tasks AHORA MISMO.
  // Aunque el upsertMetadata de abajo fallara, la huella ya quedó grabada
  // y el próximo ciclo reconocerá la tarea por ella.
  try {
    const notesConHuella = componerNotesConHuella(notasLimpias, nuevoId);
    Tasks.Tasks.patch({ id: taskGoogle.id, notes: notesConHuella },
                      taskListId, taskGoogle.id);
  } catch (e) {
    // Si esto falla, registramos pero NO abortamos: la CAPA 2 (búsqueda por
    // título) sigue protegiendo contra duplicación.
    registrarLog(LOG_TYPE.ERROR, nuevoId, '', taskGoogle.id,
      'No se pudo escribir huella en notes: ' + e.message + ' (CAPA 2 cubre).');
  }

  upsertMetadata(ss, nuevoId, taskGoogle.id, taskListId,
    new Date(), new Date(taskGoogle.updated), targetRow);
  registrarLog(LOG_TYPE.UPDATE_ROW, nuevoId, '', taskGoogle.id,
    'Tarea importada del móvil: "' + (taskGoogle.title || '') + '" → fila ' + targetRow);
}

// CAPA 2: vincula una tarea de Google Tasks a una fila que YA existe en el
// Sheet (mismo título), en vez de crear una fila duplicada.
function vincularTareaExistente(ss, sheet, fila, taskGoogle, taskListId) {
  // Escribir la huella en la tarea de Google Tasks para futuro reconocimiento
  try {
    const notasLimpias = limpiarHuella(taskGoogle.notes || '');
    const notesConHuella = componerNotesConHuella(notasLimpias, fila.idLadcc);
    Tasks.Tasks.patch({ id: taskGoogle.id, notes: notesConHuella },
                      taskListId, taskGoogle.id);
  } catch (e) {
    registrarLog(LOG_TYPE.ERROR, fila.idLadcc, '', taskGoogle.id,
      'No se pudo escribir huella al vincular: ' + e.message);
  }
  upsertMetadata(ss, fila.idLadcc, taskGoogle.id, taskListId,
    new Date(), new Date(taskGoogle.updated), fila.rowIndex);
  registrarLog(LOG_TYPE.LINK_EXISTING, fila.idLadcc, '', taskGoogle.id,
    'CAPA 2: tarea vinculada a fila existente "' + fila.tarea +
    '" en vez de duplicar');
}

function generarSiguienteIdLadcc(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'LADCC-001';
  const ids = sheet.getRange(2, COL_V31.ID, lastRow - 1, 1).getValues();
  let max = 0;
  ids.forEach(row => {
    const m = String(row[0] || '').match(/^LADCC-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  });
  return 'LADCC-' + String(max + 1).padStart(3, '0');
}

function limpiarPrefijoSiExiste(titulo) {
  return String(titulo || '').replace(/^\[[^\]]+\]\s*/, '').trim();
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 11: RESOLUCIÓN DE TAREAS CONOCIDAS
// ═══════════════════════════════════════════════════════════════════════════

function resolverTareaConocida(sheet, taskListIdActual, taskGoogle, meta,
                               lastSync, ss, listasMap) {
  let filaEfectiva = leerFilaIndividual(sheet, meta.rowIndexCache || -1);
  if (!filaEfectiva || filaEfectiva.idLadcc !== meta.taskIdLadcc) {
    filaEfectiva = buscarFilaPorIdLadcc(sheet, meta.taskIdLadcc);
    if (!filaEfectiva) return 'SKIP';
    upsertMetadata(ss, meta.taskIdLadcc, meta.taskIdGoogle, meta.taskListId,
      meta.updatedAtSheet, meta.updatedAtTasks, filaEfectiva.rowIndex);
    meta.rowIndexCache = filaEfectiva.rowIndex;
  }

  if (!estaEnFiltroSync(filaEfectiva)) return 'SKIP';

  // Cambio de categoría → mover a otra lista
  // FIX bug routing: solo mover si la categoría existe explícitamente.
  // Si no hay categoría, respetar la lista actual de Google Tasks
  // (típicamente: tarea creada desde móvil o desde una webapp externa
  // que aún no asigna categoría).
  if (filaEfectiva.categoria && filaEfectiva.categoria.trim() !== '') {
    const listaCorrecta = obtenerListaParaCategoria(filaEfectiva.categoria, listasMap);
    if (listaCorrecta.id !== meta.taskListId) {
      moverTareaDeListaAOtra(filaEfectiva, meta, listaCorrecta, ss);
      return 'MOVED';
    }
  }

  const taskUpdated = new Date(taskGoogle.updated);
  const taskUpdatedPrev = meta.updatedAtTasks || new Date(0);
  const sheetUpdated = meta.updatedAtSheet || new Date(0);
  const tasksChanged = Math.abs(taskUpdated.getTime() - taskUpdatedPrev.getTime())
                        > CFG_SYNC.TIMESTAMP_TOLERANCE_MS;
  const sheetChanged = sheetUpdated.getTime() > lastSync.getTime() -
                        CFG_SYNC.TIMESTAMP_TOLERANCE_MS;

  if (taskGoogle.status === TASKS_STATUS.COMPLETED && !filaEfectiva.hecha) {
    marcarHechaEnSheet(sheet, filaEfectiva.rowIndex, ss, meta);
    return 'COMPLETED';
  }
  if (taskGoogle.status === TASKS_STATUS.NEEDS_ACTION && filaEfectiva.hecha) {
    desmarcarHechaEnSheet(sheet, filaEfectiva.rowIndex, ss, meta);
    return 'COMPLETED';
  }

  if (tasksChanged && sheetChanged) {
    if (taskUpdated.getTime() >= sheetUpdated.getTime()) {
      actualizarFilaDesdeTaskGoogle(sheet, filaEfectiva.rowIndex, taskGoogle, ss, meta);
      registrarLog(LOG_TYPE.CONFLICT_TASKS_WINS, filaEfectiva.idLadcc, '',
        taskGoogle.id, 'Gana Tasks');
    } else {
      actualizarTaskDesdeFila(meta.taskListId, filaEfectiva, taskGoogle, ss, meta);
      registrarLog(LOG_TYPE.CONFLICT_SHEET_WINS, filaEfectiva.idLadcc, '',
        taskGoogle.id, 'Gana Sheet');
    }
    return 'CONFLICT';
  }
  if (tasksChanged) {
    actualizarFilaDesdeTaskGoogle(sheet, filaEfectiva.rowIndex, taskGoogle, ss, meta);
    return 'UPDATED';
  }
  if (sheetChanged) {
    actualizarTaskDesdeFila(meta.taskListId, filaEfectiva, taskGoogle, ss, meta);
    return 'UPDATED';
  }
  return 'SKIP';
}

function moverTareaDeListaAOtra(fila, meta, nuevaLista, ss) {
  try {
    eliminarTaskDeGoogle(meta.taskListId, meta.taskIdGoogle);
  } catch (e) { /* si ya no existe, ignorar */ }
  const titulo = construirTituloConPrefijo(fila.tarea, fila.categoria);
  const taskBody = {
    title: titulo.substring(0, CFG_SYNC.MAX_TITLE_LENGTH),
    status: TASKS_STATUS.NEEDS_ACTION,
    notes: componerNotesConHuella(fila.descripcion, fila.idLadcc)
  };
  const dueFormat = formatearFechaParaGoogleTasks(fila.deadline);
  if (dueFormat) taskBody.due = dueFormat;
  const taskNueva = Tasks.Tasks.insert(taskBody, nuevaLista.id);
  upsertMetadata(ss, fila.idLadcc, taskNueva.id, nuevaLista.id,
    new Date(), new Date(taskNueva.updated), fila.rowIndex);
  registrarLog(LOG_TYPE.MOVE_LIST, fila.idLadcc, nuevaLista.title, taskNueva.id,
    'Movida de lista por cambio de categoría');
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 12: ESCRITURA — TASKS → SHEET
// ═══════════════════════════════════════════════════════════════════════════

function actualizarFilaDesdeTaskGoogle(sheet, rowIndex, taskGoogle, ss, meta) {
  const tituloLimpio = limpiarPrefijoSiExiste(
    limpiarHuellaDeTitulo(taskGoogle.title || ''));
  const notasLimpias = limpiarHuella(taskGoogle.notes || '');
  sheet.getRange(rowIndex, COL_V31.TAREA).setValue(tituloLimpio);
  sheet.getRange(rowIndex, COL_V31.DESCRIPCION).setValue(notasLimpias);
  const deadline = parsearFechaDesdeGoogleTasks(taskGoogle.due);
  sheet.getRange(rowIndex, COL_V31.DEADLINE).setValue(deadline || '');
  upsertMetadata(ss, meta.taskIdLadcc, meta.taskIdGoogle, meta.taskListId,
    meta.updatedAtSheet, new Date(taskGoogle.updated), rowIndex);
  registrarLog(LOG_TYPE.UPDATE_ROW, meta.taskIdLadcc, '', taskGoogle.id,
    '"' + tituloLimpio + '" actualizada desde Google Tasks');
}

function marcarHechaEnSheet(sheet, rowIndex, ss, meta) {
  sheet.getRange(rowIndex, COL_V31.HECHA).setValue(true);
  sheet.getRange(rowIndex, COL_V31.ESTADO).setValue(ESTADO_TXT.HECHA);
  sheet.getRange(rowIndex, COL_V31.FECHA_COMPLETADO).setValue(new Date());
  upsertMetadata(ss, meta.taskIdLadcc, meta.taskIdGoogle, meta.taskListId,
    meta.updatedAtSheet, new Date(), rowIndex);
  registrarLog(LOG_TYPE.COMPLETE_ROW, meta.taskIdLadcc, '', meta.taskIdGoogle,
    'Marcada Hecha desde Google Tasks');
}

function desmarcarHechaEnSheet(sheet, rowIndex, ss, meta) {
  sheet.getRange(rowIndex, COL_V31.HECHA).setValue(false);
  sheet.getRange(rowIndex, COL_V31.ESTADO).setValue(ESTADO_TXT.PENDIENTE);
  sheet.getRange(rowIndex, COL_V31.FECHA_COMPLETADO).clearContent();
  upsertMetadata(ss, meta.taskIdLadcc, meta.taskIdGoogle, meta.taskListId,
    meta.updatedAtSheet, new Date(), rowIndex);
  registrarLog(LOG_TYPE.REOPEN_ROW, meta.taskIdLadcc, '', meta.taskIdGoogle,
    'Reabierta desde Google Tasks');
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 13: ESCRITURA — SHEET → TASKS
// ═══════════════════════════════════════════════════════════════════════════

function actualizarTaskDesdeFila(taskListId, fila, taskGoogle, ss, meta) {
  const tituloConPrefijo = construirTituloConPrefijo(fila.tarea, fila.categoria);
  const update = {
    id: taskGoogle.id,
    title: tituloConPrefijo.substring(0, CFG_SYNC.MAX_TITLE_LENGTH),
    // mantener la huella siempre presente en las notes
    notes: componerNotesConHuella(fila.descripcion, fila.idLadcc)
  };
  const dueFormat = formatearFechaParaGoogleTasks(fila.deadline);
  update.due = dueFormat || null;
  const taskActualizada = Tasks.Tasks.patch(update, taskListId, taskGoogle.id);
  upsertMetadata(ss, fila.idLadcc, taskGoogle.id, taskListId,
    new Date(), new Date(taskActualizada.updated), fila.rowIndex);
  registrarLog(LOG_TYPE.UPDATE_TASK, fila.idLadcc, '', taskGoogle.id,
    '"' + fila.tarea + '" actualizada en Google Tasks');
}

function aplicarSalidaDelFiltro(sheet, taskListId, fila, meta, ss) {
  if (fila.hecha || fila.archivar) {
    completarTaskEnGoogle(taskListId, meta.taskIdGoogle);
    upsertMetadata(ss, fila.idLadcc, meta.taskIdGoogle, meta.taskListId,
      meta.updatedAtSheet, new Date(), fila.rowIndex);
    registrarLog(LOG_TYPE.COMPLETE_TASK, fila.idLadcc, '', meta.taskIdGoogle,
      fila.hecha ? 'Hecha → completed' : 'Archivada → completed');
    return;
  }
  eliminarTaskDeGoogle(taskListId, meta.taskIdGoogle);
  eliminarMetadata(ss, fila.idLadcc);
  let razon = 'Salió del filtro';
  if (!fila.syncATasks) razon = 'Checkbox Sync desmarcado';
  else if (!responsableIncluyeOwner(fila.responsable)) razon = 'Reasignada';
  else if (fila.estado === ESTADO_TXT.CANCELADA) razon = 'Cancelada';
  registrarLog(LOG_TYPE.DELETE_TASK, fila.idLadcc, '', meta.taskIdGoogle, razon);
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 14: UTILIDADES DE FORMATO
// ═══════════════════════════════════════════════════════════════════════════

function construirTituloConPrefijo(tarea, categoria) {
  const t = String(tarea || '').trim();
  const c = String(categoria || '').trim();
  if (!c) return t;
  return '[' + c + '] ' + t;
}

function parsearFechaDesdeGoogleTasks(dueStr) {
  if (!dueStr) return '';
  const m = String(dueStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

function formatearFechaParaGoogleTasks(valor) {
  if (!(valor instanceof Date) || isNaN(valor.getTime())) return null;
  const y = valor.getFullYear();
  const m = String(valor.getMonth() + 1).padStart(2, '0');
  const d = String(valor.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d + 'T00:00:00.000Z';
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 15: INFRAESTRUCTURA Y LOG  (v2.2 — robustez)
// ═══════════════════════════════════════════════════════════════════════════

function inicializarEstructurasSync() {
  const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);

  // Hoja _Sync_Metadata — SIN pre-formateo masivo de filas (v2.2)
  let meta = ss.getSheetByName(CFG_SYNC.SHEET_METADATA);
  if (!meta) {
    meta = ss.insertSheet(CFG_SYNC.SHEET_METADATA);
    meta.getRange(1, 1, 1, META_HEADERS.length).setValues([META_HEADERS])
      .setFontWeight('bold').setBackground('#0f1048').setFontColor('#ffffff');
    meta.setFrozenRows(1);
    meta.hideSheet();
  }

  // Hoja Log_Sync — SIN pre-formateo masivo de filas (v2.2)
  let log = ss.getSheetByName(CFG_SYNC.SHEET_LOG);
  if (!log) {
    log = ss.insertSheet(CFG_SYNC.SHEET_LOG);
    log.getRange(1, 1, 1, LOG_HEADERS_V2.length).setValues([LOG_HEADERS_V2])
      .setFontWeight('bold').setBackground('#34a853').setFontColor('#ffffff');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 170); log.setColumnWidth(2, 200);
    log.setColumnWidth(3, 130); log.setColumnWidth(4, 130);
    log.setColumnWidth(5, 200); log.setColumnWidth(6, 600);
    log.hideSheet();
  }
}

// v2.2: registrarLog YA NO falla en silencio. Si no puede escribir, activa
// el flag de aborto para que el sync se detenga en el siguiente checkpoint.
function registrarLog(tipo, taskIdLadcc, listaName, taskIdGoogle, detalle) {
  try {
    const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);
    const log = ss.getSheetByName(CFG_SYNC.SHEET_LOG);
    if (!log) return;
    const targetRow = log.getLastRow() + 1;
    log.getRange(targetRow, 1, 1, LOG_HEADERS_V2.length).setValues([[
      new Date(), tipo, taskIdLadcc || '', listaName || '',
      taskIdGoogle || '', detalle || ''
    ]]);
  } catch (e) {
    // Si el error es de límite de celdas, ABORTAR el sync.
    const msg = String(e.message || '').toLowerCase();
    if (msg.indexOf('above the limit') !== -1 ||
        msg.indexOf('10000000') !== -1 ||
        msg.indexOf('number of cells') !== -1) {
      SYNC_ABORT.activo = true;
      SYNC_ABORT.razon = 'No se pudo escribir el log: límite de celdas del Sheet';
      console.error('ABORT: ' + SYNC_ABORT.razon);
    } else {
      console.error('Log error (no crítico): ' + e.message);
    }
  }
}

// v2.2: poda DURA. Mantiene solo las últimas MAX_LOG_FILAS, sin importar
// antigüedad. Se ejecuta SIEMPRE al final de cada sync.
function podarLogDuro() {
  try {
    const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);
    const log = ss.getSheetByName(CFG_SYNC.SHEET_LOG);
    if (!log) return;
    const lastRow = log.getLastRow();
    const filasDatos = lastRow - 1;
    if (filasDatos <= CFG_SYNC.MAX_LOG_FILAS) return;

    // Conservar solo las últimas MAX_LOG_FILAS filas
    const aEliminar = filasDatos - CFG_SYNC.MAX_LOG_FILAS;
    log.deleteRows(2, aEliminar);
    console.log('Log podado: ' + aEliminar + ' filas antiguas eliminadas. ' +
                'Quedan ' + CFG_SYNC.MAX_LOG_FILAS + '.');
  } catch (e) {
    console.error('Error podando log: ' + e.message);
  }
}

function obtenerUltimoSync() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_KEY.LAST_SYNC);
  return raw ? new Date(parseInt(raw)) : new Date(0);
}

function guardarUltimoSync(fecha) {
  PropertiesService.getScriptProperties()
    .setProperty(PROP_KEY.LAST_SYNC, String(fecha.getTime()));
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 16: INSTALACIÓN, MENÚ, OPERACIÓN
// ═══════════════════════════════════════════════════════════════════════════

function instalarSync() {
  inicializarEstructurasSync();

  // Limpieza estricta de triggers previos de syncTasks y onOpen
  const triggers = ScriptApp.getProjectTriggers();
  let borrados = 0;
  triggers.forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'syncTasks' || fn === 'onOpen') {
      ScriptApp.deleteTrigger(t);
      borrados++;
    }
  });

  // Trigger time-driven cada 15 min (v2.2)
  ScriptApp.newTrigger('syncTasks')
    .timeBased()
    .everyMinutes(CFG_SYNC.SYNC_INTERVAL_MINUTES)
    .create();

  // Trigger onOpen instalable
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(SpreadsheetApp.openById(CFG_SYNC.SHEET_ID))
    .onOpen()
    .create();

  registrarLog(LOG_TYPE.SETUP, '', '', '',
    'Sync v2.2 instalado. Intervalo ' + CFG_SYNC.SYNC_INTERVAL_MINUTES +
    ' min. Triggers viejos borrados: ' + borrados +
    '. Anti-duplicación: 3 capas activas.');
  console.log('Sync v2.2 instalado. Triggers viejos borrados: ' + borrados +
              '. Refresca el Sheet para ver el menú.');
}

function desinstalarSync() {
  let borrados = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncTasks') {
      ScriptApp.deleteTrigger(t); borrados++;
    }
  });
  registrarLog(LOG_TYPE.TEARDOWN, '', '', '',
    'Triggers de sync eliminados: ' + borrados);
  console.log('Sync v2.2 desinstalado. Triggers borrados: ' + borrados);
}

function syncManual() {
  syncTasks();
  console.log('Sync manual completado. Revisa Log_Sync.');
  SpreadsheetApp.getActive().toast('Sincronización completada.', 'LADCC Sync', 5);
}

// v2.2: auditoría de triggers — detecta duplicados, que fue una hipótesis
// del incidente. Úsalo cuando algo se vea raro.
function auditarTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const conteo = {};
  triggers.forEach(t => {
    const fn = t.getHandlerFunction();
    conteo[fn] = (conteo[fn] || 0) + 1;
  });
  console.log('═══ AUDITORÍA DE TRIGGERS ═══');
  console.log('Total triggers: ' + triggers.length);
  for (const fn in conteo) {
    const alerta = conteo[fn] > 1 ? '  ⚠️ DUPLICADO' : '';
    console.log('  ' + fn + ': ' + conteo[fn] + alerta);
  }
  const syncCount = conteo['syncTasks'] || 0;
  let msg;
  if (syncCount === 0) {
    msg = 'No hay trigger syncTasks. El sync automático está APAGADO.';
  } else if (syncCount === 1) {
    msg = 'OK: exactamente 1 trigger syncTasks. Correcto.';
  } else {
    msg = 'ALERTA: ' + syncCount + ' triggers syncTasks. Hay duplicados. ' +
          'Ejecuta instalarSync() para limpiar.';
  }
  console.log(msg);
  SpreadsheetApp.getActive().toast(msg, 'LADCC Sync — Auditoría', 12);
}

function forzarResetSync() {
  // SEGURIDAD: para ejecutar esta función desde el editor de Apps Script,
  // cambia la línea de abajo de false a true y guarda. Evita correrla por
  // accidente. Cuando termines, vuelve a ponerla en false.
  const CONFIRMO_RESET = false;

  if (!CONFIRMO_RESET) {
    console.log('forzarResetSync NO ejecutada. Para correrla: cambia ' +
                'CONFIRMO_RESET a true, guarda, y ejecuta de nuevo. ' +
                'Esto eliminará todas las tareas sincronizadas de Google ' +
                'Tasks y vaciará la metadata.');
    return;
  }

  const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);
  const metadata = leerMetadata(ss);
  let eliminadas = 0;
  metadata.todas.forEach(meta => {
    if (meta.taskIdGoogle && meta.taskListId) {
      try {
        eliminarTaskDeGoogle(meta.taskListId, meta.taskIdGoogle);
        eliminadas++;
      } catch (e) { /* ya eliminada */ }
    }
  });
  const meta = ss.getSheetByName(CFG_SYNC.SHEET_METADATA);
  if (meta && meta.getLastRow() > 1) {
    meta.getRange(2, 1, meta.getLastRow() - 1, META_HEADERS.length).clearContent();
  }
  guardarUltimoSync(new Date(0));
  registrarLog(LOG_TYPE.RESET, '', '', '',
    'Reset completo. ' + eliminadas + ' tareas eliminadas de Google Tasks');
  console.log('Reset OK. ' + eliminadas + ' tareas eliminadas de Google Tasks. ' +
              'Metadata vaciada. Ejecuta syncManual cuando quieras recrear.');
}

function debugSync() {
  inicializarEstructurasSync();
  const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);
  const sheet = ss.getSheetByName(CFG_SYNC.SHEET_MAIN);

  let listasMap, tareas = [];
  let cuotaOK = true;
  try {
    listasMap = obtenerOCrearTodasLasListas();
    tareas = listarTareasDeTodasLasListas(listasMap);
  } catch (e) {
    if (esErrorDeCuota(e)) { cuotaOK = false; }
    else throw e;
  }

  const metadata = leerMetadata(ss);
  const filas = leerTareasSheetSincronizables(sheet);
  const filasEnFiltro = filas.filter(f => estaEnFiltroSync(f));
  const lastSync = obtenerUltimoSync();
  const triggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncTasks');
  const log = ss.getSheetByName(CFG_SYNC.SHEET_LOG);
  const logFilas = log ? Math.max(0, log.getLastRow() - 1) : 0;

  console.log('═══ DIAGNÓSTICO LADCC SYNC v2.2 ═══');
  console.log('Cuota Tasks API:', cuotaOK ? 'OK' : '⚠️ AGOTADA');
  if (cuotaOK) {
    console.log('Listas Google Tasks:');
    for (const nombre in listasMap) {
      const enLista = tareas.filter(t => t.taskListId === listasMap[nombre].id).length;
      console.log('  • ' + nombre + ': ' + enLista + ' tareas');
    }
  }
  console.log('Filas con ID:', filas.length);
  console.log('Filas en filtro (Sync=TRUE, de Luis, activas):', filasEnFiltro.length);
  console.log('Entradas Metadata:', metadata.todas.length);
  console.log('Filas en Log_Sync:', logFilas + ' (tope: ' + CFG_SYNC.MAX_LOG_FILAS + ')');
  console.log('Último sync:', lastSync.toISOString());
  console.log('Triggers syncTasks:', triggers.length +
              (triggers.length > 1 ? ' ⚠️ DUPLICADOS' : ''));

  if (cuotaOK) {
    console.log('\n── FILAS EN FILTRO (destino esperado) ──');
    filasEnFiltro.forEach(f => {
      const lista = obtenerListaParaCategoria(f.categoria, listasMap);
      const m = metadata.byLadccId.get(f.idLadcc);
      const yaSync = m && m.taskIdGoogle ? '✓' : '✗';
      console.log(yaSync + ' ' + f.idLadcc + ' [' + (f.categoria || 'sin cat') +
                  ' → ' + lista.title + '] ' + f.tarea.substring(0, 45));
    });
  }
  SpreadsheetApp.getActive().toast(
    'Diagnóstico listo. Ver Registros de ejecución.', 'LADCC Sync', 8);
}

function crearMenuPersonalizado() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('LADCC Sync')
    .addItem('Sincronizar ahora', 'syncManual')
    .addItem('Ver log', 'menuVerLog')
    .addItem('Diagnóstico', 'debugSync')
    .addItem('Auditar triggers', 'auditarTriggers')
    .addSeparator()
    .addItem('Reparar schema (checkboxes/formato)', 'menuRepararSchema')
    .addItem('Limpiar filas vacías finales', 'menuLimpiarFilasVacias')
    .addSeparator()
    .addItem('Reset multi-lista', 'forzarResetSync')
    .addItem('Vaciar Google Tasks (un solo uso)', 'limpiarTodasLasListasGoogleTasks')
    .addToUi();
}

function menuVerLog() {
  const ss = SpreadsheetApp.getActive();
  const log = ss.getSheetByName(CFG_SYNC.SHEET_LOG);
  if (!log) {
    ss.toast('No existe Log_Sync. Ejecuta instalarSync().', 'LADCC Sync', 5);
    return;
  }
  log.showSheet();
  ss.setActiveSheet(log);
}

function menuRepararSchema() {
  if (typeof repararSchema === 'function') {
    repararSchema();
  } else {
    SpreadsheetApp.getActive().toast(
      'Función no disponible. Verifica Code.gs v3.2.', 'LADCC Sync', 5);
  }
}

function menuLimpiarFilasVacias() {
  if (typeof limpiarFilasVaciasFinales === 'function') {
    const respuesta = SpreadsheetApp.getUi().alert(
      'Limpiar filas vacías',
      'Esto elimina las filas vacías al final del Sheet (solo donde col C / ' +
      'ID está vacía). Las tareas reales NO se tocan. ¿Continuar?',
      SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (respuesta === SpreadsheetApp.getUi().Button.YES) {
      limpiarFilasVaciasFinales();
    }
  } else {
    SpreadsheetApp.getActive().toast(
      'Función no disponible. Verifica Code.gs v3.2.', 'LADCC Sync', 5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 17: LIMPIEZA DE UN SOLO USO  (v2.2.1)
// ═══════════════════════════════════════════════════════════════════════════
//
// limpiarTodasLasListasGoogleTasks() vacía por completo las 6 listas que el
// sync maneja (Superlikers, LADCC, DCDG, LIH, La Isabella, DCC). Borra TODAS
// las tareas — activas y completadas — sin depender de la metadata.
//
// USO: una sola vez, para dejar Google Tasks en cero antes de encender el
// sync v2.2 sobre un Sheet ya limpio. Después de usarla, NO se vuelve a
// necesitar: el sync normal mantiene el orden por sí solo.
//
// NO toca listas que el sync no conoce (ej. SuperPesos, DCC antiguas, etc.
// que no estén en LISTAS_GOOGLE_TASKS). Esas se gestionan a mano.

function limpiarTodasLasListasGoogleTasks() {
  // ─────────────────────────────────────────────────────────────────────
  // SEGURIDAD: para ejecutar esta función desde el editor de Apps Script,
  // cambia la línea de abajo de false a true y guarda (Ctrl+S).
  // Luego ejecútala. Cuando termine, vuelve a ponerla en false.
  // Esto evita que se corra por accidente y borre todo Google Tasks.
  // ─────────────────────────────────────────────────────────────────────
  const CONFIRMO_VACIAR_GOOGLE_TASKS = false;

  if (!CONFIRMO_VACIAR_GOOGLE_TASKS) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('Función NO ejecutada (medida de seguridad).');
    console.log('Esta función borra TODAS las tareas de las 6 listas:');
    console.log('Superlikers, LADCC, DCDG, LIH, La Isabella, DCC.');
    console.log('NO toca SuperPesos ni Success Round 2024.');
    console.log('');
    console.log('Para ejecutarla:');
    console.log('1. Cambia CONFIRMO_VACIAR_GOOGLE_TASKS de false a true.');
    console.log('2. Guarda (Ctrl+S).');
    console.log('3. Ejecuta la función de nuevo.');
    console.log('4. Cuando termine, vuelve a ponerla en false.');
    console.log('═══════════════════════════════════════════════════════');
    return;
  }

  let listasMap;
  try {
    listasMap = obtenerOCrearTodasLasListas();
  } catch (e) {
    if (esErrorDeCuota(e)) {
      console.error('Cuota de Tasks API agotada. Espera al reset de ' +
                    'medianoche (hora del Pacífico) e intenta de nuevo.');
      return;
    }
    throw e;
  }

  let totalBorradas = 0;
  const detallePorLista = [];
  let huboErrorCuota = false;

  for (const nombre in listasMap) {
    if (huboErrorCuota) break;
    const lista = listasMap[nombre];
    let borradasEnLista = 0;

    // Traer todas las tareas de la lista (activas + completadas)
    let tareas = [];
    try {
      let pageToken = null;
      do {
        const resp = Tasks.Tasks.list(lista.id, {
          maxResults: 100, showCompleted: true, showHidden: true,
          showDeleted: false, pageToken: pageToken
        });
        if (resp.items) tareas = tareas.concat(resp.items);
        pageToken = resp.nextPageToken;
      } while (pageToken);
    } catch (e) {
      if (esErrorDeCuota(e)) { huboErrorCuota = true; break; }
      throw e;
    }

    // Borrar una por una
    for (let i = 0; i < tareas.length; i++) {
      try {
        Tasks.Tasks.remove(lista.id, tareas[i].id);
        borradasEnLista++;
        totalBorradas++;
      } catch (e) {
        if (esErrorDeCuota(e)) { huboErrorCuota = true; break; }
        // si una tarea ya no existe, seguir con las demás
        console.error('No se pudo borrar tarea en ' + nombre + ': ' + e.message);
      }
    }
    detallePorLista.push(nombre + '=' + borradasEnLista);
    console.log('Lista ' + nombre + ': ' + borradasEnLista + ' tareas borradas');
  }

  // Limpiar también la metadata, ya que las tareas ya no existen
  try {
    const ss = SpreadsheetApp.openById(CFG_SYNC.SHEET_ID);
    const meta = ss.getSheetByName(CFG_SYNC.SHEET_METADATA);
    if (meta && meta.getLastRow() > 1) {
      meta.getRange(2, 1, meta.getLastRow() - 1, META_HEADERS.length).clearContent();
    }
    guardarUltimoSync(new Date(0));
  } catch (e) {
    console.error('Error limpiando metadata: ' + e.message);
  }

  registrarLog(LOG_TYPE.RESET, '', '', '',
    'Limpieza de un solo uso. Borradas: ' + totalBorradas +
    ' (' + detallePorLista.join(', ') + ')' +
    (huboErrorCuota ? ' [INTERRUMPIDO POR CUOTA]' : ''));

  console.log('═══════════════════════════════════════════════════════');
  if (huboErrorCuota) {
    console.log('PARCIAL: se borraron ' + totalBorradas + ' tareas, pero la ');
    console.log('cuota de Tasks API se agotó antes de terminar.');
    console.log('Espera al reset de medianoche y vuelve a ejecutar esta');
    console.log('función para terminar (deja CONFIRMO en true).');
  } else {
    console.log('LISTO. ' + totalBorradas + ' tareas borradas de las 6 listas.');
    console.log(detallePorLista.join('  |  '));
    console.log('Metadata limpiada. Google Tasks está en cero.');
    console.log('Ya puedes seguir con debugSync y luego instalarSync.');
    console.log('RECUERDA: vuelve a poner CONFIRMO_VACIAR_GOOGLE_TASKS en false.');
  }
  console.log('═══════════════════════════════════════════════════════');
}



function onOpen() {
  crearMenuPersonalizado();
}
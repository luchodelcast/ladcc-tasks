/**
 * ============================================================================
 * LADCC Tasks Manager — Code.gs v3.2.0
 * ============================================================================
 * Autor: Claude (asistente LADCC)
 * Fecha: 2026-05-02
 *
 * Cambios v3.1.0 → v3.2.0:
 *   1. Fix bug de auto-archivado al marcar Hecha. Marcar checkbox A=TRUE NO
 *      mueve la fila al Archivo. El movimiento solo ocurre al marcar
 *      checkbox B (Archivar).
 *   2. Función nueva repararSchema(): repara checkboxes, formato condicional
 *      y validaciones en TODAS las filas hasta el final real del Sheet.
 *      Resuelve el problema de filas sin checkbox después de fila ~160.
 *   3. Función nueva limpiarFilasVaciasFinales(): elimina las filas vacías
 *      al final del Sheet para que appendRow vuelva a funcionar normal.
 *   4. manejarEdicion extendido: actualiza metadata del sync y dispara
 *      syncInmediato cuando se marca el checkbox Q "Sync a Tasks".
 *
 * Schema v3.1 (17 columnas):
 *   1=Hecha, 2=Archivar, 3=ID, 4=Tarea, 5=Descripción, 6=Deadline,
 *   7=Importancia, 8=Urgencia, 9=Categoría, 10=Estado, 11=Bloqueado por,
 *   12=Event ID, 13=Notas, 14=Responsable, 15=Beneficiario,
 *   16=Fecha completado, 17=Sync a Tasks.
 * ============================================================================
 */

// ─── CONFIGURACIÓN GLOBAL ──────────────────────────────────────────────────
const CFG = {
  SHEET_MAIN: "Mis Tareas",
  SHEET_ARCHIVO: "Archivo",
  OWNER: "Luis",
  COLS: {
    HECHA: 1,
    ARCHIVAR: 2,
    ID: 3,
    TAREA: 4,
    DESCRIPCION: 5,
    DEADLINE: 6,
    IMPORTANCIA: 7,
    URGENCIA: 8,
    CATEGORIA: 9,
    ESTADO: 10,
    BLOQUEADO_POR: 11,
    EVENT_ID: 12,
    NOTAS: 13,
    RESPONSABLE: 14,
    BENEFICIARIO: 15,
    FECHA_COMPLETADO: 16,
    SYNC_A_TASKS: 17
  },
  NUM_COLS: 17,
  COLOR_HECHA: "#d9ead3",
  COLOR_HEADER_BG: "#0f1048",
  COLOR_HEADER_FG: "#ffffff",
  COLOR_VENCIDA_BG: "#f4cccc",
  COLOR_VENCIDA_FG: "#990000"
};


// ─── DIRECTORIO DE COLABORADORES ───────────────────────────────────────────
const DIRECTORIO_EQUIPO = {
  "Luis Alberto Del Castillo":    "luis@iwin.im",
  "Luis Del Castillo":            "luis@iwin.im",
  "Luis":                         "luis@iwin.im",

  "Carolina Suarez":              "carolinasuarez@iwin.im",
  "Carolina Suárez":              "carolinasuarez@iwin.im",
  "Caro Suarez":                  "carolinasuarez@iwin.im",
  "Caro Suárez":                  "carolinasuarez@iwin.im",
  "Caro":                         "carolinasuarez@iwin.im",

  "Carolina Diazgranados":        "carolina@iwin.im",
  "Carolina DiazGranados":        "carolina@iwin.im",
  "Carolina Díaz Granados":       "carolina@iwin.im",
  "Carolina Diaz Granados":       "carolina@iwin.im",
  "Caro Diazgranados":            "carolina@iwin.im",
  "Caro DiazGranados":            "carolina@iwin.im",
  "Caro Díaz Granados":           "carolina@iwin.im",
  "Caro Diaz Granados":           "carolina@iwin.im",

  "Tatiana Estupiñán":            "tatiana@iwin.im",
  "Tatiana Estupinan":            "tatiana@iwin.im",
  "Tatiana":                      "tatiana@iwin.im",

  "Eduardo García-Aranda":        "eduardo@iwin.im",
  "Eduardo Garcia-Aranda":        "eduardo@iwin.im",
  "Eduardo García Aranda":        "eduardo@iwin.im",
  "Eduardo":                      "eduardo@iwin.im",

  "Edgar Quintana":               "edgar@iwin.im",
  "Edgar":                        "edgar@iwin.im",

  "Edwin Cano":                   "edwin@iwin.im",
  "Edwin":                        "edwin@iwin.im",

  "Julián Clavijo":               "julian@iwin.im",
  "Julian Clavijo":               "julian@iwin.im",

  "María Camila Campo":           "mcampo@iwin.im",
  "Maria Camila Campo":           "mcampo@iwin.im",
  "Mila Campo":                   "mcampo@iwin.im",
  "Mila":                         "mcampo@iwin.im",

  "María Alejandra Rocha":        "malejandra@iwin.im",
  "Maria Alejandra Rocha":        "malejandra@iwin.im",
  "María Alejandra Rocha Vargas": "malejandra@iwin.im",
  "Mariale Rocha":                "malejandra@iwin.im",
  "Mariale":                      "malejandra@iwin.im",

  "Luisa Góngora":                "luisagongora@iwin.im",
  "Luisa Gongora":                "luisagongora@iwin.im",
  "Luisa Fernanda Parra":         "luisa@iwin.im",
  "Luisa Parra":                  "luisa@iwin.im",

  "Lina Rivera":                  "lina@iwin.im",
  "Lina Pastrana":                "linapastrana@iwin.im",
  "Lina Muriel":                  "lina_muriel@iwin.im",
  "Lina Marcela Muriel":          "lina_muriel@iwin.im",

  "Sarah Escobar":                "sarah@iwin.im",
  "Sarah":                        "sarah@iwin.im",
  "Pedro Carmona":                "pedro@iwin.im",
  "Pedro":                        "pedro@iwin.im",
  "Mateo Arenas":                 "mateo@iwin.im",
  "Mateo":                        "mateo@iwin.im",
  "Daniela Segrera":              "daniela@iwin.im",
  "Daniela":                      "daniela@iwin.im",
  "Andrea Restrepo":              "andrea@iwin.im",
  "Andrea Abril":                 "legal@iwin.im",
  "Heiner Parra":                 "heiner@iwin.im",
  "Heiner":                       "heiner@iwin.im",
  "Isabella Aguiar":              "isabella@iwin.im",
  "Camilo Redondo":               "camilojose@iwin.im"
};

const ALIAS_PROHIBIDOS = new Set([
  "Carolina", "Lina", "Luisa", "Julián", "Julian",
  "Andrea", "Diego", "Miguel", "Maria Paula", "María Paula"
]);


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 1: TRIGGER PRINCIPAL onEdit
// ═══════════════════════════════════════════════════════════════════════════
//
// manejarEdicion se dispara cada vez que LADCC edita una celda en el Sheet.
// Decide qué hacer según la columna editada.
//
// IMPORTANTE: La función debe llamarse "manejarEdicion" (no "onEdit") porque
// "onEdit" es trigger simple automático sin permisos para enviar emails.
// El trigger instalable se monta vía la función instalarTriggers().

function manejarEdicion(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CFG.SHEET_MAIN) return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row === 1) return;
    if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) return;

    // BLOQUE 1.1: Checkbox Hecha (col A)
    // Marca/desmarca como hecha. NO mueve al Archivo.
    if (col === CFG.COLS.HECHA) {
      if (e.value === "TRUE") {
        marcarHecha(sheet, row);
      } else if (e.value === "FALSE") {
        desmarcarHecha(sheet, row);
      }
      actualizarMetadataSync(sheet, row);
      return;
    }

    // BLOQUE 1.2: Checkbox Archivar (col B)
    // ÚNICO disparador del movimiento al Archivo.
    if (col === CFG.COLS.ARCHIVAR && e.value === "TRUE") {
      actualizarMetadataSync(sheet, row);
      moverAHoja(sheet, row, CFG.SHEET_ARCHIVO,
        ["Fecha archivado", "Razón"],
        () => [new Date(), ""]);
      return;
    }

    // BLOQUE 1.3: Cambio en Responsable o Beneficiario
    if (col === CFG.COLS.RESPONSABLE || col === CFG.COLS.BENEFICIARIO) {
      const valorNuevo = String(e.value || "").trim();
      const valorAnterior = String(e.oldValue || "").trim();
      if (valorNuevo !== valorAnterior) {
        notificarAsignacion(sheet, row, col, valorNuevo, valorAnterior);
        if (col === CFG.COLS.RESPONSABLE) {
          actualizarMetadataSync(sheet, row);
        }
      }
      return;
    }

    // BLOQUE 1.4: Checkbox Sync a Tasks (col Q) — Activación inmediata
    if (col === CFG.COLS.SYNC_A_TASKS) {
      actualizarMetadataSync(sheet, row);
      if (typeof syncInmediato === 'function') {
        try {
          syncInmediato(row);
        } catch (errSync) {
          console.error('Error en syncInmediato:', errSync.message);
        }
      }
      return;
    }

    // BLOQUE 1.5: Cambios en cols sincronizables
    // Tarea, Descripción, Deadline, Categoría, Estado: actualizar metadata
    // para que el próximo sync detecte el cambio.
    const colsSincronizables = [
      CFG.COLS.TAREA, CFG.COLS.DESCRIPCION, CFG.COLS.DEADLINE,
      CFG.COLS.CATEGORIA, CFG.COLS.ESTADO
    ];
    if (colsSincronizables.indexOf(col) !== -1) {
      actualizarMetadataSync(sheet, row);
    }
  } catch (err) {
    SpreadsheetApp.getActive().toast("Error onEdit: " + err.message, "LADCC Tasks", 10);
    console.error(err);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 2: ACCIONES DE FILAS
// ═══════════════════════════════════════════════════════════════════════════

// BLOQUE 2.1: Marcar tarea como Hecha. Solo escribe Estado y timestamp.
// NO mueve la fila a ninguna parte. El formato condicional se encarga del
// tachado y color verde.
function marcarHecha(sheet, row) {
  sheet.getRange(row, CFG.COLS.FECHA_COMPLETADO).setValue(new Date());
  const estadoCell = sheet.getRange(row, CFG.COLS.ESTADO);
  if (estadoCell.getValue() !== "Hecha") {
    estadoCell.setValue("Hecha");
  }
}

// BLOQUE 2.2: Desmarcar Hecha. Vuelve a Pendiente, limpia timestamp.
function desmarcarHecha(sheet, row) {
  sheet.getRange(row, CFG.COLS.FECHA_COMPLETADO).clearContent();
  const estadoCell = sheet.getRange(row, CFG.COLS.ESTADO);
  if (estadoCell.getValue() === "Hecha") {
    estadoCell.setValue("Pendiente");
  }
}

// BLOQUE 2.3: Mover una fila a otra hoja. Usado SOLO por checkbox Archivar.
function moverAHoja(sheet, row, targetName, extraHeaders, extraValuesFn) {
  const ss = sheet.getParent();
  let target = ss.getSheetByName(targetName);
  const numCols = sheet.getLastColumn();

  if (!target) {
    target = ss.insertSheet(targetName);
    const headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
    const fullHeaders = headers.concat(extraHeaders);
    const hRange = target.getRange(1, 1, 1, fullHeaders.length);
    hRange.setValues([fullHeaders]);
    hRange.setFontWeight("bold");
    hRange.setBackground(CFG.COLOR_HEADER_BG);
    hRange.setFontColor(CFG.COLOR_HEADER_FG);
    target.setFrozenRows(1);
  }

  const values = sheet.getRange(row, 1, 1, numCols).getValues()[0];
  const extras = extraValuesFn ? extraValuesFn() : extraHeaders.map(() => "");
  target.appendRow(values.concat(extras));
  sheet.deleteRow(row);
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 3: PARSING Y NOTIFICACIÓN
// ═══════════════════════════════════════════════════════════════════════════

function parsearListaNombres(valor) {
  if (!valor) return [];
  return String(valor)
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function notificarAsignacion(sheet, row, col, valorNuevo, valorAnterior) {
  const nuevos = parsearListaNombres(valorNuevo);
  const anteriores = parsearListaNombres(valorAnterior);
  const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const anterioresSet = new Set(anteriores.map(normalizar));
  const añadidos = nuevos.filter(n => !anterioresSet.has(normalizar(n)));

  if (añadidos.length === 0) return;

  for (const nombre of añadidos) {
    const email = detectarEmailPorNombre(nombre);
    if (!email) continue;
    enviarEmailAsignacion(sheet, row, col, nombre, email, nuevos);
  }
}

function enviarEmailAsignacion(sheet, row, col, nombreDestino, emailDestino, todosLosNombres) {
  const rowData = sheet.getRange(row, 1, 1, CFG.NUM_COLS).getValues()[0];

  const id           = rowData[CFG.COLS.ID - 1];
  const tarea        = rowData[CFG.COLS.TAREA - 1];
  const descripcion  = rowData[CFG.COLS.DESCRIPCION - 1];
  const deadline     = rowData[CFG.COLS.DEADLINE - 1];
  const categoria    = rowData[CFG.COLS.CATEGORIA - 1];
  const estado       = rowData[CFG.COLS.ESTADO - 1];
  const notas        = rowData[CFG.COLS.NOTAS - 1];
  const responsable  = rowData[CFG.COLS.RESPONSABLE - 1];
  const beneficiario = rowData[CFG.COLS.BENEFICIARIO - 1];

  const nombreAmigable = nombreAmigableDeEmail(emailDestino);
  const esResponsable = col === CFG.COLS.RESPONSABLE;

  const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const coAsignados = todosLosNombres.filter(n => normalizar(n) !== normalizar(nombreDestino));
  const esCompartida = coAsignados.length > 0;

  const subject = esResponsable
    ? (esCompartida
        ? "Tarea compartida asignada: " + id + " — " + tarea
        : "Nueva tarea asignada: " + id + " — " + tarea)
    : "Te aparece como beneficiario: " + id + " — " + tarea;

  const ss = SpreadsheetApp.getActive();
  const sheetUrl = ss.getUrl();
  const mainGid = sheet.getSheetId();
  const linkFila = sheetUrl + "#gid=" + mainGid + "&range=A" + row;
  const tabPersonal = ss.getSheetByName(nombreAmigable);
  const linkPestana = tabPersonal
    ? sheetUrl + "#gid=" + tabPersonal.getSheetId()
    : null;

  const deadlineStr = (deadline instanceof Date)
    ? Utilities.formatDate(deadline, "America/Bogota", "yyyy-MM-dd")
    : (deadline || "Sin fecha");

  let introMsg;
  if (esResponsable && esCompartida) {
    introMsg = "Hola " + nombreAmigable + ", te asignaron una tarea en LADCC Tasks, " +
               "compartida con: " + coAsignados.join(", ") + ".";
  } else if (esResponsable) {
    introMsg = "Hola " + nombreAmigable + ", te asignaron una tarea en LADCC Tasks.";
  } else {
    introMsg = "Hola " + nombreAmigable + ", apareces como beneficiario de una tarea en LADCC Tasks " +
               "(alguien más la va a ejecutar, pero tú recibes el entregable).";
  }

  const html =
    '<div style="font-family: Arial, sans-serif; max-width: 640px; color: #3A3A3A; line-height: 1.5;">' +
      '<div style="background: #0f1048; color: white; padding: 16px 20px; border-radius: 6px 6px 0 0;">' +
        '<strong style="font-size: 16px;">LADCC Tasks</strong>' +
      '</div>' +
      '<div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 6px 6px;">' +
        '<p style="margin-top:0;">' + introMsg + '</p>' +
        '<table style="border-collapse: collapse; width: 100%; margin: 12px 0;">' +
          '<tr><td style="padding:6px 8px; color:#666; width:130px;">ID</td>' +
              '<td style="padding:6px 8px;"><strong>' + id + '</strong></td></tr>' +
          '<tr style="background:#f8f8f8;"><td style="padding:6px 8px; color:#666;">Tarea</td>' +
              '<td style="padding:6px 8px;"><strong>' + tarea + '</strong></td></tr>' +
          '<tr><td style="padding:6px 8px; color:#666;">Descripción</td>' +
              '<td style="padding:6px 8px;">' + (descripcion || "—") + '</td></tr>' +
          '<tr style="background:#f8f8f8;"><td style="padding:6px 8px; color:#666;">Deadline</td>' +
              '<td style="padding:6px 8px;">' + deadlineStr + '</td></tr>' +
          '<tr><td style="padding:6px 8px; color:#666;">Categoría</td>' +
              '<td style="padding:6px 8px;">' + (categoria || "—") + '</td></tr>' +
          '<tr style="background:#f8f8f8;"><td style="padding:6px 8px; color:#666;">Estado</td>' +
              '<td style="padding:6px 8px;">' + (estado || "—") + '</td></tr>' +
          '<tr><td style="padding:6px 8px; color:#666;">Responsable</td>' +
              '<td style="padding:6px 8px;">' + (responsable || "—") + '</td></tr>' +
          '<tr style="background:#f8f8f8;"><td style="padding:6px 8px; color:#666;">Beneficiario</td>' +
              '<td style="padding:6px 8px;">' + (beneficiario || "—") + '</td></tr>' +
          (notas ? '<tr><td style="padding:6px 8px; color:#666;">Notas</td>' +
              '<td style="padding:6px 8px; font-style:italic;">' + notas + '</td></tr>' : '') +
        '</table>' +
        '<div style="margin: 20px 0;">' +
          '<a href="' + linkFila + '" style="display:inline-block; background:#0f1048; color:white; ' +
              'padding:10px 18px; text-decoration:none; border-radius:4px; margin-right:8px;">' +
            'Ver en Mis Tareas</a>' +
          (linkPestana ?
            '<a href="' + linkPestana + '" style="display:inline-block; background:#05ced1; color:#0f1048; ' +
                'padding:10px 18px; text-decoration:none; border-radius:4px; font-weight:bold;">' +
              'Ver mi pestaña personal</a>' : '') +
        '</div>' +
        '<p style="color:#888; font-size:12px; margin-bottom:0;">' +
          'Email automático desde LADCC Tasks. La edición se hace en la pestaña ' +
          '<strong>Mis Tareas</strong> (única fuente de verdad).' +
        '</p>' +
      '</div>' +
    '</div>';

  try {
    MailApp.sendEmail({
      to: emailDestino,
      subject: subject,
      htmlBody: html,
      name: "LADCC Tasks"
    });
    registrarEnvio(ss, id, emailDestino,
      esResponsable ? "Responsable" : "Beneficiario", nombreDestino);
  } catch (err) {
    console.error("Error enviando email a " + emailDestino + ": " + err.message);
  }
}

function detectarEmailPorNombre(valor) {
  const valorTrim = String(valor || "").trim();
  if (!valorTrim) return null;

  if (valorTrim.indexOf("@") !== -1) {
    const emailLower = valorTrim.toLowerCase();
    for (const nombre in DIRECTORIO_EQUIPO) {
      if (DIRECTORIO_EQUIPO[nombre].toLowerCase() === emailLower) {
        return emailLower;
      }
    }
    return null;
  }

  for (const prohibido of ALIAS_PROHIBIDOS) {
    if (valorTrim.toLowerCase() === prohibido.toLowerCase()) return null;
  }

  const valorLower = valorTrim.toLowerCase();
  for (const nombre in DIRECTORIO_EQUIPO) {
    if (nombre.toLowerCase() === valorLower) return DIRECTORIO_EQUIPO[nombre];
  }

  const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const valorNorm = normalizar(valorTrim);
  for (const nombre in DIRECTORIO_EQUIPO) {
    if (normalizar(nombre) === valorNorm) return DIRECTORIO_EQUIPO[nombre];
  }

  return null;
}

function nombreAmigableDeEmail(email) {
  const emailLower = String(email || "").toLowerCase();
  const cortos = {
    "luis@iwin.im":             "Luis",
    "carolinasuarez@iwin.im":   "Caro",
    "carolina@iwin.im":         "Carolina",
    "tatiana@iwin.im":          "Tatiana",
    "eduardo@iwin.im":          "Eduardo",
    "edgar@iwin.im":            "Edgar",
    "edwin@iwin.im":            "Edwin",
    "julian@iwin.im":           "Julián",
    "mcampo@iwin.im":           "Mila",
    "malejandra@iwin.im":       "Mariale",
    "luisagongora@iwin.im":     "Luisa G",
    "luisa@iwin.im":            "Luisa Parra",
    "lina@iwin.im":             "Lina R",
    "linapastrana@iwin.im":     "Lina Pastrana",
    "lina_muriel@iwin.im":      "Lina Muriel",
    "sarah@iwin.im":            "Sarah",
    "pedro@iwin.im":            "Pedro",
    "mateo@iwin.im":            "Mateo",
    "daniela@iwin.im":          "Daniela"
  };
  return cortos[emailLower] || emailLower.split("@")[0];
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 4: METADATA DEL SYNC (helper para Sync_v2.gs)
// ═══════════════════════════════════════════════════════════════════════════
//
// Esta función la llama manejarEdicion para actualizar UpdatedAtSheet en la
// hoja oculta _Sync_Metadata. Si Sync_v2 no está instalado (no hay hoja
// _Sync_Metadata), no hace nada — el Code.gs sigue funcionando solo.

function actualizarMetadataSync(sheet, rowIndex) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('LADCC_SYNC_IN_PROGRESS') === 'true') return;

    const ss = sheet.getParent();
    const meta = ss.getSheetByName('_Sync_Metadata');
    if (!meta) return;

    const idLadcc = String(sheet.getRange(rowIndex, CFG.COLS.ID).getValue() || '').trim();
    if (!idLadcc) return;

    const lastRow = meta.getLastRow();
    if (lastRow < 2) return;

    const ids = meta.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === idLadcc) {
        meta.getRange(i + 2, 3).setValue(new Date());
        return;
      }
    }
  } catch (err) {
    console.error('actualizarMetadataSync error:', err.message);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 5: LOG DE NOTIFICACIONES
// ═══════════════════════════════════════════════════════════════════════════

function registrarEnvio(ss, taskId, email, tipo, valor) {
  let log = ss.getSheetByName("_log_notificaciones");
  if (!log) {
    log = ss.insertSheet("_log_notificaciones");
    log.appendRow(["Timestamp", "Task ID", "Email destinatario", "Tipo", "Valor asignado"]);
    log.getRange(1, 1, 1, 5)
       .setFontWeight("bold")
       .setBackground("#0f1048")
       .setFontColor("#ffffff");
    log.setFrozenRows(1);
    log.hideSheet();
  }
  log.appendRow([new Date(), taskId, email, tipo, valor]);
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 6: REPARACIÓN DE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════
//
// Función nueva en v3.2.0. Repara checkboxes, formato condicional y
// validaciones en TODAS las filas hasta el final real del Sheet.
// Resuelve los bugs de:
//   - Filas sin checkbox después de fila ~160.
//   - Formato condicional (rojo/verde) sin aplicar en filas lejanas.
//   - Validaciones (dropdowns) sin aplicar.

function repararSchema() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(CFG.SHEET_MAIN);
  if (!sheet) throw new Error("No existe hoja " + CFG.SHEET_MAIN);

  const lastRow = sheet.getLastRow();
  const maxRow = sheet.getMaxRows();
  const numFilasReparar = Math.max(lastRow, maxRow);

  // BLOQUE 6.1: Reinstalar checkboxes en cols A, B, Q para todas las filas
  if (numFilasReparar >= 2) {
    const numFilas = numFilasReparar - 1;
    sheet.getRange(2, CFG.COLS.HECHA, numFilas, 1).insertCheckboxes();
    sheet.getRange(2, CFG.COLS.ARCHIVAR, numFilas, 1).insertCheckboxes();
    sheet.getRange(2, CFG.COLS.SYNC_A_TASKS, numFilas, 1).insertCheckboxes();
  }

  // BLOQUE 6.2: Reaplicar validaciones (dropdowns) a todas las filas
  const rangoValidacion = numFilasReparar - 1;
  if (rangoValidacion > 0) {
    const valImportancia = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Muy Alta", "Alta", "Media", "Baja"], true)
      .setAllowInvalid(true).build();
    sheet.getRange(2, CFG.COLS.IMPORTANCIA, rangoValidacion, 1)
      .setDataValidation(valImportancia);

    const valUrgencia = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Urgente", "Pronto", "Sin fecha", "Flexible"], true)
      .setAllowInvalid(true).build();
    sheet.getRange(2, CFG.COLS.URGENCIA, rangoValidacion, 1)
      .setDataValidation(valUrgencia);

    const valEstado = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Pendiente", "En curso", "Bloqueado", "Hecha", "Cancelada"], true)
      .setAllowInvalid(true).build();
    sheet.getRange(2, CFG.COLS.ESTADO, rangoValidacion, 1)
      .setDataValidation(valEstado);
  }

  // BLOQUE 6.3: Reaplicar formato condicional (verde si Hecha, rojo si vencida)
  const rangoFormato = sheet.getRange(2, 1, rangoValidacion, CFG.NUM_COLS);
  const reglaHecha = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$A2=TRUE')
    .setBackground(CFG.COLOR_HECHA)
    .setFontColor("#666666")
    .setStrikethrough(true)
    .setRanges([rangoFormato])
    .build();
  const reglaVencida = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2<>"", ISDATE($F2), $F2<TODAY(), $A2<>TRUE)')
    .setBackground(CFG.COLOR_VENCIDA_BG)
    .setFontColor(CFG.COLOR_VENCIDA_FG)
    .setRanges([rangoFormato])
    .build();
  sheet.setConditionalFormatRules([reglaHecha, reglaVencida]);

  // BLOQUE 6.4: Formato de fecha en cols F y P
  if (rangoValidacion > 0) {
    sheet.getRange(2, CFG.COLS.DEADLINE, rangoValidacion, 1)
      .setNumberFormat("yyyy-mm-dd");
    sheet.getRange(2, CFG.COLS.FECHA_COMPLETADO, rangoValidacion, 1)
      .setNumberFormat("yyyy-mm-dd hh:mm");
  }

  ss.toast("Schema reparado en " + rangoValidacion + " filas.", "LADCC Tasks", 8);
  console.log('Schema reparado: ' + rangoValidacion + ' filas afectadas.');
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 7: LIMPIEZA DE FILAS VACÍAS FINALES
// ═══════════════════════════════════════════════════════════════════════════
//
// Elimina todas las filas vacías al final del Sheet, donde "vacío" significa
// que la columna ID (C) está vacía. Esto soluciona el problema de appendRow
// saltando a fila 260 porque las filas con checkbox preasignado eran
// detectadas como "ocupadas" por getLastRow.

function limpiarFilasVaciasFinales() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(CFG.SHEET_MAIN);
  if (!sheet) throw new Error("No existe hoja " + CFG.SHEET_MAIN);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ss.toast("No hay filas que limpiar.", "LADCC Tasks", 5);
    return;
  }

  // BLOQUE 7.1: Encontrar la última fila con datos reales (ID en col C)
  const ids = sheet.getRange(2, CFG.COLS.ID, lastRow - 1, 1).getValues();
  let ultimaFilaConDatos = 1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() !== '') {
      ultimaFilaConDatos = i + 2;
    }
  }

  // BLOQUE 7.2: Eliminar todas las filas después de la última con datos
  if (ultimaFilaConDatos < lastRow) {
    const filasAEliminar = lastRow - ultimaFilaConDatos;
    sheet.deleteRows(ultimaFilaConDatos + 1, filasAEliminar);
    ss.toast("Eliminadas " + filasAEliminar + " filas vacías al final.", "LADCC Tasks", 8);
    console.log('Filas vacías eliminadas: ' + filasAEliminar +
                '. Última fila con datos: ' + ultimaFilaConDatos);
  } else {
    ss.toast("No hay filas vacías al final.", "LADCC Tasks", 5);
  }

  // BLOQUE 7.3: Reaplicar reparación de schema en las filas válidas
  repararSchema();
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 8: UTILIDADES E INSTALACIÓN
// ═══════════════════════════════════════════════════════════════════════════

function instalarTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    const fn = t.getHandlerFunction();
    if (fn === "onEdit" || fn === "manejarEdicion") ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger("manejarEdicion")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  SpreadsheetApp.getActive().toast("Triggers instalados.", "LADCC Tasks", 5);
}

function probarEnvioEmail() {
  const ss = SpreadsheetApp.getActive();
  MailApp.sendEmail({
    to: DIRECTORIO_EQUIPO["Luis"],
    subject: "Test LADCC Tasks v3.2 — Sistema activo",
    htmlBody: '<div style="font-family: Arial; color: #3A3A3A;">' +
      '<h2 style="color: #0f1048;">Sistema de notificaciones activo (v3.2).</h2>' +
      '<p>Si recibes este email, los permisos están autorizados.</p></div>',
    name: "LADCC Tasks"
  });
  ss.toast("Email de prueba enviado.", "LADCC Tasks", 8);
}

function recuperarFilaAMisTareas() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getActiveSheet();
  const name = sheet.getName();

  if (name === CFG.SHEET_MAIN) {
    ss.toast("Esta tarea ya está en Mis Tareas.", "LADCC Tasks", 5);
    return;
  }

  const row = sheet.getActiveCell().getRow();
  if (row === 1) {
    ss.toast("Selecciona una fila, no el header.", "LADCC Tasks", 5);
    return;
  }

  const main = ss.getSheetByName(CFG.SHEET_MAIN);
  const values = sheet.getRange(row, 1, 1, CFG.NUM_COLS).getValues()[0];

  values[CFG.COLS.HECHA - 1] = false;
  values[CFG.COLS.ARCHIVAR - 1] = false;
  values[CFG.COLS.FECHA_COMPLETADO - 1] = "";
  values[CFG.COLS.ESTADO - 1] = "Pendiente";

  main.appendRow(values);

  const newRow = main.getLastRow();
  main.getRange(newRow, CFG.COLS.HECHA).insertCheckboxes();
  main.getRange(newRow, CFG.COLS.ARCHIVAR).insertCheckboxes();
  main.getRange(newRow, CFG.COLS.SYNC_A_TASKS).insertCheckboxes();

  sheet.deleteRow(row);
  ss.toast("Tarea recuperada a Mis Tareas.", "LADCC Tasks", 5);
}

function enviarResumenSemanal() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(CFG.SHEET_MAIN);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const data = sheet.getRange(2, 1, lastRow - 1, CFG.NUM_COLS).getValues();
  const porResponsable = {};

  for (const row of data) {
    const hecha = row[CFG.COLS.HECHA - 1] === true;
    const archivar = row[CFG.COLS.ARCHIVAR - 1] === true;
    const estado = String(row[CFG.COLS.ESTADO - 1] || "").trim();
    const resp = String(row[CFG.COLS.RESPONSABLE - 1] || "").trim();

    if (!resp || hecha || archivar || estado === "Hecha" || estado === "Cancelada") continue;

    const nombres = parsearListaNombres(resp);
    for (const nombre of nombres) {
      const email = detectarEmailPorNombre(nombre);
      if (!email) continue;
      if (!porResponsable[email]) porResponsable[email] = [];
      porResponsable[email].push({
        id: row[CFG.COLS.ID - 1],
        tarea: row[CFG.COLS.TAREA - 1],
        deadline: row[CFG.COLS.DEADLINE - 1],
        urgencia: row[CFG.COLS.URGENCIA - 1],
        estado: estado
      });
    }
  }

  let enviados = 0;
  for (const email in porResponsable) {
    const tareas = porResponsable[email];
    const nombre = nombreAmigableDeEmail(email);
    let filas = "";
    for (const t of tareas) {
      const deadlineStr = (t.deadline instanceof Date)
        ? Utilities.formatDate(t.deadline, "America/Bogota", "yyyy-MM-dd")
        : (t.deadline || "—");
      filas += '<tr>' +
        '<td style="padding:6px 8px; border-bottom:1px solid #eee;">' + t.id + '</td>' +
        '<td style="padding:6px 8px; border-bottom:1px solid #eee;">' + t.tarea + '</td>' +
        '<td style="padding:6px 8px; border-bottom:1px solid #eee;">' + deadlineStr + '</td>' +
        '<td style="padding:6px 8px; border-bottom:1px solid #eee;">' + t.urgencia + '</td>' +
        '</tr>';
    }
    const html =
      '<div style="font-family: Arial, sans-serif; max-width: 720px; color: #3A3A3A;">' +
        '<div style="background: #0f1048; color: white; padding: 16px 20px;">' +
          '<strong style="font-size: 16px;">Resumen semanal — ' + nombre + '</strong>' +
        '</div>' +
        '<div style="border:1px solid #ddd; border-top:none; padding: 20px;">' +
          '<p>Hola ' + nombre + ', estas son tus tareas pendientes:</p>' +
          '<table style="border-collapse:collapse; width:100%;">' +
            '<tr style="background:#0f1048; color:white;">' +
              '<th style="padding:8px; text-align:left;">ID</th>' +
              '<th style="padding:8px; text-align:left;">Tarea</th>' +
              '<th style="padding:8px; text-align:left;">Deadline</th>' +
              '<th style="padding:8px; text-align:left;">Urgencia</th>' +
            '</tr>' + filas +
          '</table>' +
          '<p style="margin-top:20px; color:#888; font-size:12px;">' +
            'Total: ' + tareas.length + ' tareas. ' +
            '<a href="' + ss.getUrl() + '">Abrir LADCC Tasks</a>.' +
          '</p>' +
        '</div>' +
      '</div>';
    MailApp.sendEmail({
      to: email,
      subject: "Resumen semanal LADCC Tasks — " + tareas.length + " pendientes",
      htmlBody: html,
      name: "LADCC Tasks"
    });
    enviados++;
  }
  ss.toast("Resumen semanal enviado a " + enviados + " personas.", "LADCC Tasks", 8);
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 9: GENERACIÓN DE PESTAÑAS COLABORADORES
// ═══════════════════════════════════════════════════════════════════════════

function generarPestañasColaboradores() {
  const ss = SpreadsheetApp.getActive();
  const mainSheet = ss.getSheetByName(CFG.SHEET_MAIN);
  if (!mainSheet) throw new Error("No se encontró " + CFG.SHEET_MAIN);

  const COLABORADORES = [
    { tab: "Luis",     match: "Luis" },
    { tab: "Caro",     match: "Caro Suarez" },
    { tab: "Tatiana",  match: "Tatiana" },
    { tab: "Eduardo",  match: "Eduardo" },
    { tab: "Edgar",    match: "Edgar" },
    { tab: "Julián",   match: "Julián Clavijo" },
    { tab: "Edwin",    match: "Edwin" },
    { tab: "Mila",     match: "Mila" },
    { tab: "Mariale",  match: "Mariale" },
    { tab: "Luisa G",  match: "Luisa Góngora" },
    { tab: "Lina R",   match: "Lina Rivera" }
  ];

  const COLS_QUERY = "C, D, F, H, I, J, M, N, O";
  const HEADERS_QUERY = [
    "ID", "Tarea", "Deadline", "Urgencia", "Categoría",
    "Estado", "Notas", "Responsable", "Beneficiario"
  ];
  const NUM_COLS_QUERY = HEADERS_QUERY.length;
  const MAIN_TAB = CFG.SHEET_MAIN;
  const NAVY = "#0f1048";
  const TEAL = "#05ced1";
  const YELLOW = "#fff3b0";
  const sheetUrl = ss.getUrl();

  for (const colab of COLABORADORES) {
    const tabName = colab.tab;
    const match = colab.match;

    let tab = ss.getSheetByName(tabName);
    if (!tab) {
      tab = ss.insertSheet(tabName);
    } else {
      tab.clear();
      tab.clearConditionalFormatRules();
    }

    tab.getRange(1, 1, 1, NUM_COLS_QUERY).merge()
       .setValue("Vista personal de " + tabName)
       .setFontSize(16).setFontWeight("bold")
       .setBackground(NAVY).setFontColor("#ffffff")
       .setHorizontalAlignment("center").setVerticalAlignment("middle");
    tab.setRowHeight(1, 36);

    const linkFormula = '=HYPERLINK("' + sheetUrl + '#gid=' + mainSheet.getSheetId() +
                        '","Editar en Mis Tareas (única fuente de verdad)")';
    tab.getRange(2, 1).setFormula(linkFormula)
                      .setFontColor("#1155cc").setFontWeight("bold");
    tab.getRange(2, NUM_COLS_QUERY).setFormula('="Última actualización: "&TEXT(NOW(), "yyyy-mm-dd HH:mm")')
                             .setFontColor("#666666").setFontStyle("italic")
                             .setHorizontalAlignment("right");

    tab.getRange(4, 1, 1, NUM_COLS_QUERY).merge()
       .setValue("LO QUE DEBO HACER")
       .setFontSize(13).setFontWeight("bold")
       .setBackground(TEAL).setFontColor(NAVY)
       .setHorizontalAlignment("left");
    tab.setRowHeight(4, 28);

    tab.getRange(5, 1, 1, NUM_COLS_QUERY).setValues([HEADERS_QUERY])
       .setFontWeight("bold").setBackground("#e8e8ee").setFontColor(NAVY)
       .setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

    const queryA = '=IFERROR(QUERY(\'' + MAIN_TAB + '\'!A2:Q, ' +
      '"SELECT ' + COLS_QUERY + ' WHERE N CONTAINS \'' + match + '\' ' +
      'AND J <> \'Hecha\' AND A <> TRUE AND B <> TRUE ORDER BY F ASC", 0), ' +
      '"— Sin tareas pendientes —")';
    tab.getRange(6, 1).setFormula(queryA);

    const filaB = 40;
    tab.getRange(filaB, 1, 1, NUM_COLS_QUERY).merge()
       .setValue("LO QUE ME DEBEN")
       .setFontSize(13).setFontWeight("bold")
       .setBackground(YELLOW).setFontColor(NAVY)
       .setHorizontalAlignment("left");
    tab.setRowHeight(filaB, 28);

    tab.getRange(filaB + 1, 1, 1, NUM_COLS_QUERY).setValues([HEADERS_QUERY])
       .setFontWeight("bold").setBackground("#e8e8ee").setFontColor(NAVY)
       .setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

    const queryB = '=IFERROR(QUERY(\'' + MAIN_TAB + '\'!A2:Q, ' +
      '"SELECT ' + COLS_QUERY + ' WHERE O CONTAINS \'' + match + '\' ' +
      'AND NOT N CONTAINS \'' + match + '\' ' +
      'AND J <> \'Hecha\' AND A <> TRUE AND B <> TRUE ORDER BY F ASC", 0), ' +
      '"— Nadie me debe nada por ahora —")';
    tab.getRange(filaB + 2, 1).setFormula(queryB);

    const range = tab.getRange(6, 1, 200, NUM_COLS_QUERY);
    const reglaHecha = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$F6="Hecha"')
      .setBackground("#d9ead3").setStrikethrough(true).setFontColor("#666666")
      .setRanges([range]).build();
    const reglaVencida = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($C6<>"", ISDATE($C6), $C6<TODAY(), $F6<>"Hecha")')
      .setBackground("#f4cccc").setFontColor("#990000")
      .setRanges([range]).build();
    tab.setConditionalFormatRules([reglaHecha, reglaVencida]);

    tab.setColumnWidth(1, 95);   tab.setColumnWidth(2, 280);
    tab.setColumnWidth(3, 100);  tab.setColumnWidth(4, 90);
    tab.setColumnWidth(5, 160);  tab.setColumnWidth(6, 100);
    tab.setColumnWidth(7, 240);  tab.setColumnWidth(8, 180);
    tab.setColumnWidth(9, 160);

    tab.setFrozenRows(5);
    tab.getRange(6, 2, 200, 1).setWrap(true);
    tab.getRange(6, 7, 200, 1).setWrap(true);
    tab.getRange(filaB + 2, 2, 200, 1).setWrap(true);
    tab.getRange(filaB + 2, 7, 200, 1).setWrap(true);
  }

  const mainIndex = mainSheet.getIndex();
  let insertPos = mainIndex + 1;
  for (const colab of COLABORADORES) {
    const sh = ss.getSheetByName(colab.tab);
    if (!sh) continue;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(insertPos);
    insertPos++;
  }
  ss.setActiveSheet(mainSheet);

  ss.toast("Pestañas regeneradas: " + COLABORADORES.length, "LADCC Tasks", 8);
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOQUE 10: DIAGNÓSTICO
// ═══════════════════════════════════════════════════════════════════════════

function diagnosticar() {
  const tests = [
    "carolina@iwin.im",
    "Carolina Diazgranados",
    "Caro Suarez",
    "carolinasuarez@iwin.im",
    "Luis",
    "Tatiana, Edwin",
    "Lina Rivera, Tatiana Estupiñán",
    "Carolina"
  ];

  Logger.log("=== TEST DE DETECCIÓN ===");
  for (const v of tests) {
    if (v.indexOf(",") !== -1) continue;
    const email = detectarEmailPorNombre(v);
    Logger.log("'" + v + "' -> " + (email || "NULL"));
  }

  Logger.log("\n=== TEST DE PARSEO ===");
  for (const v of tests) {
    if (v.indexOf(",") === -1) continue;
    const nombres = parsearListaNombres(v);
    Logger.log("'" + v + "' -> " + JSON.stringify(nombres));
  }

  Logger.log("\n=== ENVÍO ===");
  try {
    MailApp.sendEmail({
      to: "luis@iwin.im",
      subject: "Diagnóstico LADCC Tasks v3.2 — " + new Date().toLocaleTimeString(),
      body: "MailApp funciona correctamente."
    });
    Logger.log("MailApp OK.");
  } catch (e) {
    Logger.log("MailApp ERROR: " + e.message);
  }

  try {
    Logger.log("Cuota emails restantes: " + MailApp.getRemainingDailyQuota());
  } catch (e) {
    Logger.log("Error cuota: " + e.message);
  }

  SpreadsheetApp.getActive().toast("Diagnóstico listo.", "LADCC Tasks", 10);
}
/**
 * Endpoint.js — Webhook público para crear tareas en "Mis Tareas".
 * Recibe POST con JSON, valida token + categoría, y agrega una fila nueva.
 * No modifica Code.js ni Sync_v2.1.js.
 */

const CATEGORIAS_VALIDAS = [
  'HOT',
  'Super Meseros',
  'SuperDroguistas',
  'EGO',
  'Master Waiters',
  'XGAIGE',
  'Fundraising',
  'Legal',
  'Legal/Fiscal',
  'Comercial',
  'Producto',
  'Studio',
  'AB InBev',
  'Operativa interna',
  'Personal',
  'LIH',
  'DCC',
  'DCDG'
];

const SHEET_TAREAS = 'Mis Tareas';

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    // 1) Parseo del body
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return _jsonResponse({ ok: false, error: 'JSON inválido' });
    }

    // 2) Autenticación por token (desde Script Properties)
    var TOKEN_ENDPOINT = PropertiesService.getScriptProperties().getProperty('TOKEN_ENDPOINT');
    if (!TOKEN_ENDPOINT) {
      return _jsonResponse({ ok: false, error: 'Endpoint no configurado' });
    }
    if (!payload.token || payload.token !== TOKEN_ENDPOINT) {
      return _jsonResponse({ ok: false, error: 'Token inválido' });
    }

    // 3) Validación de campos obligatorios
    var tarea = payload.tarea;
    var categoria = payload.categoria;

    if (!tarea || String(tarea).trim() === '') {
      return _jsonResponse({ ok: false, error: 'Falta el campo obligatorio: tarea' });
    }
    if (!categoria || String(categoria).trim() === '') {
      return _jsonResponse({ ok: false, error: 'Falta el campo obligatorio: categoria' });
    }

    // 4) Validación estricta de categoría
    if (CATEGORIAS_VALIDAS.indexOf(categoria) === -1) {
      return _jsonResponse({ ok: false, error: 'Categoría no válida' });
    }

    // 5) Campos opcionales con defaults
    var descripcion = payload.descripcion || '';
    var deadline = payload.deadline || '';
    var importancia = payload.importancia || 'Media';
    var urgencia = payload.urgencia || 'Pronto';
    var responsable = payload.responsable || 'Luis';

    // 6) Apertura de hoja y generación de ID
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_TAREAS);
    if (!sheet) {
      return _jsonResponse({ ok: false, error: 'No se encontró la hoja "' + SHEET_TAREAS + '"' });
    }

    var lastRow = sheet.getLastRow();
    var maxN = 0;
    if (lastRow >= 2) {
      var idValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
      for (var i = 0; i < idValues.length; i++) {
        var raw = idValues[i][0];
        if (raw == null) continue;
        var match = String(raw).match(/^LADCC-(\d+)$/);
        if (match) {
          var n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxN) maxN = n;
        }
      }
    }
    var nuevoId = 'LADCC-' + (maxN + 1);

    // 7) Construcción y escritura de la fila
    var fila = [
      false,         // 1 Hecha
      false,         // 2 Archivar
      nuevoId,       // 3 ID
      tarea,         // 4 Tarea
      descripcion,   // 5 Descripción
      deadline,      // 6 Deadline
      importancia,   // 7 Importancia
      urgencia,      // 8 Urgencia
      categoria,     // 9 Categoría
      'Pendiente',   // 10 Estado
      '',            // 11 Bloqueado por
      '',            // 12 Event ID
      '',            // 13 Notas
      responsable,   // 14 Responsable
      'Luis',        // 15 Beneficiario
      '',            // 16 Fecha completado
      true           // 17 Sync a Tasks
    ];

    var nuevaFila = lastRow + 1;
    sheet.getRange(nuevaFila, 1, 1, fila.length).setValues([fila]);

    // 8) Asegurar que col 1, 2 y 17 queden como checkboxes reales
    var checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    sheet.getRange(nuevaFila, 1).setDataValidation(checkboxRule);
    sheet.getRange(nuevaFila, 2).setDataValidation(checkboxRule);
    sheet.getRange(nuevaFila, 17).setDataValidation(checkboxRule);

    // 9) Respuesta de éxito
    return _jsonResponse({
      ok: true,
      id: nuevoId,
      mensaje: 'Tarea creada'
    });

  } catch (err) {
    return _jsonResponse({
      ok: false,
      error: (err && err.message) ? err.message : String(err)
    });
  }
}

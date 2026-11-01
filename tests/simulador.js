'use strict';
/* =====================================================================
 * Simulador de Google Apps Script + Google Sheets + Drive para las pruebas.
 * Ejecuta el apps-script/Code.gs REAL (script central) dentro de Node con
 * varias hojas de cálculo en memoria (Administración, una por usuario y,
 * si hace falta, una "hoja antigua" para probar la migración) y lo expone
 * por HTTP como la aplicación web publicada. Sin datos reales: todo es inventado.
 * ===================================================================== */
const fs = require('fs');
const vm = require('vm');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { RUTINA_PRUEBA } = require('./rutina-prueba');

const RAIZ = path.join(__dirname, '..');

/** Una pestaña: rejilla de celdas (por defecto 1000 × 26, como en Google Sheets) */
function crearPestana(nombre, filas = 1000, cols = 26, ultimaFalsa = false) {
  const g = Array.from({ length: filas }, () => Array(cols).fill(''));
  const validaciones = [];
  const comprobar = (r, c, nr, nc) => {
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`rango no válido ${r},${c},${nr},${nc}`);
    if (r - 1 + nr > g.length) throw new Error(`rango fuera de la pestaña ${h.nombre}: fila ${r - 1 + nr} > ${g.length}`);
    if (c - 1 + nc > cols) throw new Error(`rango fuera de la pestaña ${h.nombre}: columna ${c - 1 + nc} > ${cols}`);
  };
  const h = {
    nombre, g, validaciones,
    getName: () => h.nombre,
    setName: (n) => { h.nombre = n; return h; },
    getLastRow: () => {
      if (ultimaFalsa) return g.length;   // como el Registro antiguo: las ARRAYFORMULA ocupan hasta el final
      for (let i = g.length - 1; i >= 0; i--) if (g[i].some((x) => x !== '' && x !== null)) return i + 1;
      return 0;
    },
    getMaxRows: () => g.length,
    insertRowsAfter: (_, n) => { for (let i = 0; i < n; i++) g.push(Array(cols).fill('')); return h; },
    setFrozenRows: () => h,
    getRange: (r, c, nr = 1, nc = 1) => {
      comprobar(r, c, nr, nc);
      const rango = {
        getValues: () => g.slice(r - 1, r - 1 + nr).map((f) => f.slice(c - 1, c - 1 + nc)),
        getValue: () => g[r - 1][c - 1],
        setValues: (v) => {
          if (v.length !== nr || v.some((f) => f.length !== nc)) throw new Error(`tamaño ${v.length}x${v[0].length} != ${nr}x${nc}`);
          v.forEach((f, i) => f.forEach((x, j) => { g[r - 1 + i][c - 1 + j] = x; }));
          return rango;
        },
        setValue: (x) => { g[r - 1][c - 1] = x; return rango; },
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) g[r - 1 + i][c - 1 + j] = ''; return rango; },
        setNumberFormat: () => rango,
        setFontWeight: () => rango,
        setNote: () => rango,
        setDataValidation: (v) => { validaciones.push({ r, c, nr, nc, v }); return rango; }
      };
      return rango;
    }
  };
  return h;
}

/** Un libro (archivo de hoja de cálculo) */
function crearLibro(id, nombre) {
  const pestanas = [crearPestana('Hoja 1')];
  const libro = {
    id, nombre, pestanas, carpeta: null,
    getId: () => id,
    getName: () => libro.nombre,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
    getSheets: () => pestanas.slice(),
    getSheetByName: (n) => pestanas.find((p) => p.nombre === n) || null,
    insertSheet: (n, filas, cols) => {
      if (libro.getSheetByName(n)) throw new Error('Ya existe una pestaña llamada ' + n);
      const p = crearPestana(n, filas, cols);
      pestanas.push(p);
      return p;
    },
    getSpreadsheetTimeZone: () => 'Europe/Madrid'
  };
  // Atajo para las pruebas: libro.hojas.Registro, libro.hojas.Perfil…
  libro.hojas = new Proxy({}, { get: (_, n) => libro.getSheetByName(n) });
  return libro;
}

const dos = (n) => String(n).padStart(2, '0');
const isoDe = (x) => (x instanceof Date ? `${x.getFullYear()}-${dos(x.getMonth() + 1)}-${dos(x.getDate())}` : x);

/** Utilities.formatDate con los formatos que usa el script (en la zona del proceso: Europe/Madrid) */
function formatearFecha(d, _tz, formato) {
  return formato
    .replace('yyyy', d.getFullYear()).replace('MM', dos(d.getMonth() + 1)).replace('dd', dos(d.getDate()))
    .replace('HH', dos(d.getHours())).replace('mm', dos(d.getMinutes()));
}

/**
 * Crea un simulador nuevo (estado limpio) a partir del Code.gs del repositorio.
 * opciones.suelto: el script no está dentro de la hoja (getActiveSpreadsheet() da null)
 */
function crearSimulador(opciones = {}) {
  const codigo = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
  let contador = 0;
  const nuevoId = (prefijo) => `${prefijo}${++contador}${crypto.randomBytes(6).toString('hex')}`;
  const libros = {};
  const carpetas = {};
  const nuevoLibro = (nombre) => { const l = crearLibro(nuevoId('libro'), nombre); libros[l.id] = l; return l; };
  const admin = nuevoLibro('EDUX · Administración');

  const props = {};
  const correos = [];
  const triggers = [];
  const ui = { respuestas: [], alertas: [], activa: false };
  const sesion = { usuarioActivo: 'admin@ejemplo.com' };   // '' = otra persona abriendo la página

  const crearCarpeta = (nombre, padre) => {
    const f = {
      id: nuevoId('carpeta'), nombre, padre,
      getId: () => f.id, getName: () => nombre,
      createFolder: (n) => crearCarpeta(n, f)
    };
    carpetas[f.id] = f;
    return f;
  };
  const constructorValidacion = () => {
    const v = {};
    const b = {
      requireValueInList: (lista) => { v.lista = lista; return b; },
      setAllowInvalid: (x) => { v.permitirInvalidos = x; return b; },
      build: () => v
    };
    return b;
  };

  const ctx = {
    console, Number, Date, JSON, Array, String, Math, Object, isFinite, isNaN, Error,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: formatearFecha,
      Charset: { UTF_8: 'utf8' },
      DigestAlgorithm: { MD5: 'md5' },
      // Como en Apps Script: bytes con signo (−128…127)
      computeDigest: (alg, texto) => Array.from(crypto.createHash(alg).update(texto, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (texto) => Buffer.from(texto, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    Logger: { log: () => {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (opciones.suelto ? null : admin),
      openById: (id) => {
        if (!libros[id]) throw new Error('No se encuentra el documento con el ID ' + id);
        return libros[id];
      },
      create: (nombre) => nuevoLibro(nombre),
      newDataValidation: constructorValidacion,
      flush() {},
      getUi: () => {
        if (!ui.activa) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.');
        return {
          ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
          Button: { OK: 'OK', CANCEL: 'CANCEL' },
          prompt: (titulo, texto) => {
            const r = ui.respuestas.shift();
            if (r === undefined) throw new Error('Prompt sin respuesta preparada: ' + titulo);
            return { getSelectedButton: () => (r === null ? 'CANCEL' : 'OK'), getResponseText: () => r || '' };
          },
          alert: (titulo, texto) => { ui.alertas.push({ titulo, texto }); return 'OK'; },
          createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; }
        };
      }
    },
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' },
    HtmlService: {
      createHtmlOutput: (html) => {
        const o = { setTitle: () => o, addMetaTag: () => o, getContent: () => html };
        return o;
      }
    },
    DriveApp: {
      getFilesByName: (n) => {
        const lista = Object.values(libros).filter((l) => l.nombre === n);
        return {
          hasNext: () => lista.length > 0,
          next: () => { const l = lista.shift(); return { getId: () => l.id, getMimeType: () => 'application/vnd.google-apps.spreadsheet', isTrashed: () => false }; }
        };
      },
      createFolder: (n) => crearCarpeta(n, null),
      getFolderById: (id) => { if (!carpetas[id]) throw new Error('Carpeta no encontrada'); return carpetas[id]; },
      getFileById: (id) => {
        if (!libros[id]) throw new Error('Archivo no encontrado');
        return { moveTo: (carpeta) => { libros[id].carpeta = carpeta; } };
      }
    },
    MailApp: { sendEmail: (o) => correos.push(o) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => 'admin@ejemplo.com' }),
      getActiveUser: () => ({ getEmail: () => sesion.usuarioActivo }),
      getScriptTimeZone: () => 'Europe/Madrid'
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => (base ? base + '/exec' : null) }),
      WeekDay: { MONDAY: 'MONDAY' },
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => {
        const cfg = { fn };
        const b = {
          timeBased: () => b, onWeekDay: (d) => { cfg.dia = d; return b; }, atHour: (h) => { cfg.hora = h; return b; },
          nearMinute: (m) => { cfg.min = m; return b; }, everyWeeks: (n) => { cfg.semanas = n; return b; }, everyDays: (n) => { cfg.dias = n; return b; },
          create: () => { const t = { cfg, getHandlerFunction: () => fn }; triggers.push(t); return t; }
        };
        return b;
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);

  /** Llama a una función del script con argumentos (copiados para que vivan en el contexto del script) */
  const ejecutar = (fn, ...args) => {
    ctx.__args = JSON.parse(JSON.stringify(args));
    return vm.runInContext(`${fn}.apply(null, __args)`, ctx);
  };
  const usuarios = () => ejecutar('leerUsuarios_');
  const libroDe = (nombreOId) => {
    const u = usuarios().find((x) => x.id === nombreOId || x.nombre === nombreOId);
    return u ? libros[u.hoja] : null;
  };
  const volcar = (h) => (h ? h.g.slice(0, h.getLastRow()).map((f) => f.map(isoDe)) : null);

  /** Rutina de prueba en la hoja de un usuario (formato nuevo) */
  const ponerRutina = (libro, filas = RUTINA_PRUEBA) => {
    const h = libro.getSheetByName('Rutina');
    if (h.getMaxRows() > 1) h.getRange(2, 1, h.getMaxRows() - 1, 9).clearContent();
    if (filas.length) h.getRange(2, 1, filas.length, 9).setValues(filas.map((f) => f.slice()));
  };

  /**
   * Hoja con el formato ANTIGUO (v1–v7), para probar la migración.
   * datos: { registro: [[fecha, sesión, ejercicio, serie, peso, reps, nota]], tiempos: [[fecha, sesión, ejercicio, min]],
   *          perfil: {nombre, nacimiento: Date, altura}, pesos: [[Date, kg]] }
   */
  const crearHojaAntigua = (datos = {}) => {
    const l = nuevoLibro('Hoja antigua (prueba)');
    l.pestanas.length = 0;
    const r = crearPestana('Rutina', 995, 9); l.pestanas.push(r);
    r.g[0] = ['Día', '#', 'Ejercicio', 'Series', 'Repeticiones', 'Descanso', '', 'Sesión', 'Series totales'];
    RUTINA_PRUEBA.forEach((f, i) => { r.g[i + 1] = [f[0], String(f[1]), f[2], String(f[3]), f[4], f[5], '', '', '']; });
    const reg = crearPestana('Registro', 1000, 12, true); l.pestanas.push(reg);
    reg.g[0][0] = 'APUNTA AQUÍ'; reg.g[1] = ['Fecha', 'Semana', 'Sesión', 'Ejercicio', 'Serie', 'Peso (kg)', 'Reps', 'Nota', 'Volumen', '1RM', '', 'Instrucciones'];
    (datos.registro || []).forEach((f, i) => { reg.g[i + 2] = [f[0], '', f[1], f[2], f[3], f[4], f[5], f[6] || '', '', '', '', '']; });
    const t = crearPestana('Tiempos', 1000, 4); l.pestanas.push(t);
    t.g[0] = ['Fecha', 'Sesión', 'Ejercicio', 'Minutos'];
    (datos.tiempos || []).forEach((f, i) => { t.g[i + 1] = f.slice(); });
    const p = crearPestana('Perfil', 1000, 5); l.pestanas.push(p);
    const pf = datos.perfil || {};
    p.g[0] = ['Dato', 'Valor', '', 'Fecha', 'Peso (kg)'];
    p.g[1] = ['Nombre', pf.nombre || '', '', '', ''];
    p.g[2] = ['Fecha de nacimiento', pf.nacimiento || '', '', '', ''];
    p.g[3] = ['Altura (cm)', pf.altura || '', '', '', ''];
    (datos.pesos || []).forEach((x, i) => { p.g[i + 1][3] = x[0]; p.g[i + 1][4] = x[1]; });
    return l.id;
  };

  let base = null;
  const servidor = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    const url = new URL(req.url, 'http://x');
    const libro = () => (url.searchParams.get('u') ? libroDe(url.searchParams.get('u')) : sim.libro);
    if (url.pathname === '/hoja') {   // filas del Registro (sin cabecera)
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ filas: volcar(libro().hojas.Registro).slice(1) }));
    }
    if (url.pathname === '/pestana') { res.writeHead(200, cors); return res.end(JSON.stringify(volcar(libro().hojas[url.searchParams.get('n')]))); }
    if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); }   // Apps Script no admite la petición previa CORS
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      if (req.method !== 'POST') {   // la página de instalación
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(ctx.doGet().getContent());
      }
      const out = ctx.doPost({ postData: { contents: cuerpo } });
      res.writeHead(200, cors);
      res.end(out.t);
    });
  });

  const sim = {
    ctx, libros, carpetas, props, correos, triggers, ui, admin, sesion,
    ejecutar, usuarios, libroDe, ponerRutina, crearHojaAntigua, volcar,
    clave: null, libro: null, hojas: null,
    /** Arranca el servidor, instala el script (usuario administrador "Prueba") y le pone la rutina de prueba */
    iniciar: (opciones = {}) => new Promise((ok) => servidor.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${servidor.address().port}`;
      const script = base + '/exec';
      if (opciones.instalar !== false) {
        const r = ejecutar('instalar', { sinUi: true, sinEmail: true, urlWebApp: script, nombre: 'Prueba' });
        sim.clave = r.usuario.clave;
        sim.libro = libros[r.usuario.hoja];
        sim.hojas = sim.libro.hojas;
        if (opciones.rutina !== false) ponerRutina(sim.libro);
      }
      ok({ base, script });
    })),
    cerrar: () => new Promise((ok) => servidor.close(() => ok()))
  };
  return sim;
}

module.exports = { crearSimulador, crearPestana, crearLibro };

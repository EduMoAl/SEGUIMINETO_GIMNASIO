'use strict';
/* =====================================================================
 * Simulador de Google Apps Script + Google Sheets para las pruebas.
 * Ejecuta el apps-script/Code.gs REAL dentro de Node con una hoja de cálculo
 * simulada en memoria (varias pestañas) y lo expone por HTTP como si fuera
 * la aplicación web publicada. Sin datos reales: todo es inventado.
 * ===================================================================== */
const fs = require('fs');
const vm = require('vm');
const http = require('http');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function crearHoja(nombre, filas = 1000, cols = 26, ultimaFalsa = false) {
  const g = Array.from({ length: filas }, () => Array(cols).fill(''));
  const h = {
    nombre, g,
    getName: () => nombre,
    getLastRow: () => {
      if (ultimaFalsa) return g.length;   // como Registro: las ARRAYFORMULA ocupan hasta el final
      for (let i = g.length - 1; i >= 0; i--) if (g[i].some((x) => x !== '' && x !== null)) return i + 1;
      return 0;
    },
    getMaxRows: () => g.length,
    insertRowsAfter: (_, n) => { for (let i = 0; i < n; i++) g.push(Array(cols).fill('')); },
    setFrozenRows: () => {},
    getRange: (r, c, nr = 1, nc = 1) => {
      const rango = {
        getValues: () => g.slice(r - 1, r - 1 + nr).map((f) => f.slice(c - 1, c - 1 + nc)),
        getValue: () => g[r - 1][c - 1],
        setValues: (v) => {
          if (v.length !== nr || v[0].length !== nc) throw new Error(`tamaño ${v.length}x${v[0].length} != ${nr}x${nc}`);
          v.forEach((f, i) => f.forEach((x, j) => { g[r - 1 + i][c - 1 + j] = x; }));
          return rango;
        },
        setValue: (x) => { g[r - 1][c - 1] = x; return rango; },
        setNumberFormat: () => rango,
        setFontWeight: () => rango
      };
      return rango;
    }
  };
  return h;
}

const isoDe = (x) => (x instanceof Date
  ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : x);

/** Crea un simulador nuevo (estado limpio) a partir del Code.gs del repositorio */
function crearSimulador() {
  const codigo = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
  const hojas = {};

  hojas.Registro = crearHoja('Registro', 1000, 12, true);
  hojas.Registro.g[0][0] = 'APUNTA AQUÍ'; hojas.Registro.g[1][0] = 'Fecha';
  for (let r = 2; r < 12; r++) hojas.Registro.g[r][11] = 'instrucciones';

  // Rutina con la misma forma que la real: A Día · B # · C Ejercicio · D Series · E Reps · F Descanso
  hojas.Rutina = crearHoja('Rutina', 995, 9);
  const c = {}; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'rutina.js'), 'utf8') + ';this.R=RUTINA;', c);
  hojas.Rutina.g[0] = ['Día', '#', 'Ejercicio', 'Series', 'Repeticiones', 'Descanso', '', 'Sesión', 'Series totales'];
  let fila = 1;
  for (const [dia, ejs] of Object.entries(c.R)) {
    ejs.forEach((e, i) => { hojas.Rutina.g[fila++] = [dia, String(i + 1), e.nombre, String(e.series), e.objetivos.join(' / '), e.descanso, '', '', '']; });
  }

  const props = {};
  const correos = [];
  const triggers = [];
  const ss = {
    getSheetByName: (n) => hojas[n] || null,
    getSpreadsheetTimeZone: () => 'Europe/Madrid',
    insertSheet: (n) => { hojas[n] = crearHoja(n, 1000, 26); return hojas[n]; }
  };
  const ctx = {
    console, Number, Date, JSON, Array, String, Math, Object, isFinite, isNaN,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: (d) => isoDe(d) },
    Logger: { log: () => {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    MailApp: { sendEmail: (o) => correos.push(o) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'propietario@ejemplo.com' }), getScriptTimeZone: () => 'Europe/Madrid' },
    ScriptApp: {
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
  const clave = vm.runInContext('generarClave()', ctx);

  const volcar = (h) => (h ? h.g.slice(0, h.getLastRow()).map((f) => f.map(isoDe)) : null);

  const servidor = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/hoja') {
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ filas: hojas.Registro.g.filter((f, i) => i >= 2 && f[0] !== '').map((f) => f.slice(0, 8).map(isoDe)) }));
    }
    if (u.pathname === '/pestana') { res.writeHead(200, cors); return res.end(JSON.stringify(volcar(hojas[u.searchParams.get('n')]))); }
    if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); }   // Apps Script no admite la petición previa CORS
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      const out = req.method === 'POST' ? ctx.doPost({ postData: { contents: cuerpo } }) : ctx.doGet();
      res.writeHead(200, cors);
      res.end(out.t);
    });
  });

  return {
    clave, hojas, ctx, correos, triggers,
    iniciar: () => new Promise((ok) => servidor.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${servidor.address().port}`;
      ok({ base, script: base + '/exec' });
    })),
    cerrar: () => new Promise((ok) => servidor.close(() => ok()))
  };
}

module.exports = { crearSimulador, crearHoja };

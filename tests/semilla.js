'use strict';
/* =====================================================================
 * Datos INVENTADOS para las pruebas (nunca datos reales):
 * ~6 semanas de entrenos con progresión, un perfil, un historial de peso
 * y unos cuantos días antiguos "solo asistencia" (como los importados de Lyfta).
 * ===================================================================== */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const c = {}; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'rutina.js'), 'utf8') + ';this.RUTINA=RUTINA;this.ORDEN=ORDEN_SESIONES;', c);

const BASE = {
  'Press banca': 55, 'Press militar': 35, 'Fondos lastrados': 0, 'Contractora de pecho': 40, 'Press francés': 25,
  'Extensión de tríceps en polea cruzada': 12.5, 'Remo en T': 50, 'Jalón al pecho, agarre neutro': 55, 'Remo en máquina': 50,
  'Curl predicador': 20, 'Curl de bíceps en polea': 15, 'Sentadilla hack': 80, 'Aductora en máquina': 50,
  'Curl femoral sentado': 40, 'Peso muerto rumano': 70, 'Hip thrust': 90
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function llamar(E, cuerpo) {
  const r = await (await fetch(E.script, { method: 'POST', body: JSON.stringify({ clave: E.clave, ...cuerpo }) })).json();
  if (!r.ok) throw new Error('semilla: ' + JSON.stringify(r));
  return r;
}

/** 17 sesiones del 21/09/2026 al 28/10/2026 en rotación Empuje → Tirón → Pierna → Fullbody */
async function sembrarEntrenos(E) {
  let d = new Date(2026, 8, 21), k = 0, n = 0;
  while (d < new Date(2026, 9, 30)) {
    const ses = c.ORDEN[k % 4];
    const ejercicios = c.RUTINA[ses].map((ej) => {
      const b = BASE[ej.nombre] ?? 20;
      const prog = Math.floor(n / 4) * (b >= 50 ? 2.5 : 1.25);
      return {
        nombre: ej.nombre,
        nota: ej.nombre === 'Press banca' && n === 8 ? 'Muy buena sensación' : '',
        series: Array.from({ length: ej.series }, (_, i) => {
          const p = Math.round((b + prog - (i ? 2.5 : 0)) * 2) / 2;
          return { serie: i + 1, peso: p > 0 ? p : 0, reps: 8 + ((n + i) % 3) };
        })
      };
    });
    await llamar(E, {
      tipo: 'sesion',
      sesion: {
        id: 'semilla' + n, sesion: ses, fecha: iso(d), ejercicios,
        tiempos: ejercicios.map((e, i) => ({ ejercicio: e.nombre, minutos: 5 + ((n + i) % 5) })),
        duracion: ejercicios.length * 7 + (n % 10)
      }
    });
    k++; n++;
    d.setDate(d.getDate() + (n % 3 === 0 ? 3 : 2));
  }
  return n;
}

async function sembrarPerfil(E) {
  await llamar(E, { tipo: 'perfil', perfil: { nombre: 'Prueba', nacimiento: '2000-03-15', altura: 180 } });
  for (const [fecha, peso] of [['2026-10-01', 80.4], ['2026-10-15', 79.8], ['2026-10-31', 79]]) await llamar(E, { tipo: 'peso', fecha, peso });
}

/** Días antiguos con asistencia pero sin series (pestaña Tiempos, fila "Sesión completa") */
function sembrarAsistencia(sim, dias) {
  const h = sim.hojas.Tiempos;
  let f = h.getLastRow() + 1;
  for (const [fecha, sesion, min] of dias) {
    const [y, m, d] = fecha.split('-').map(Number);
    h.g[f - 1][0] = new Date(y, m - 1, d, 12); h.g[f - 1][1] = sesion; h.g[f - 1][2] = 'Sesión completa'; h.g[f - 1][3] = min;
    f++;
  }
}

module.exports = { sembrarEntrenos, sembrarPerfil, sembrarAsistencia };

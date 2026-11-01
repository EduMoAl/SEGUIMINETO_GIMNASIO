'use strict';

/* =====================================================================
 * Mapa muscular (frente y espalda).
 * El dibujo viene de cuerpo-datos.js (react-native-body-highlighter, licencia MIT).
 * Aquí solo se decide el color de cada músculo según su intensidad (0–1),
 * con una escala secuencial de un solo tono (morado): más series = más claro.
 * ===================================================================== */

// Escala secuencial (índice 0 = sin trabajar) y tonos de la silueta
const ESCALA_CUERPO = ['#3a3247', '#4a2c80', '#6538c2', '#8656ee', '#b39afc'];
const PIEL_CUERPO = '#231e2d';
const BORDE_CUERPO = '#0c0a12';

// Músculos del dibujo → grupos de la app (los que no aparecen quedan en gris)
const GRUPO_DE_MUSCULO = {
  chest: 'Pecho',
  deltoids: 'Hombro',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  trapezius: 'Espalda',
  'upper-back': 'Espalda',
  quadriceps: 'Cuádriceps',
  hamstring: 'Femoral',
  gluteal: 'Glúteo',
  adductors: 'Aductores',
  abs: 'Abdomen',
  obliques: 'Abdomen',
  calves: 'Gemelos',
  forearm: 'Antebrazo',
  'lower-back': 'Lumbar'
};
// Partes que no son músculo: se pintan como la silueta
const SIN_COLOR = new Set(['hair', 'head', 'hands', 'feet', 'ankles', 'knees']);

function nivelCuerpo(v) {
  if (!v || v <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil(v * 4)));
}

function ladoSVG(partes, intensidad) {
  let s = '';
  for (const [musculo, caminos] of Object.entries(partes)) {
    const grupo = GRUPO_DE_MUSCULO[musculo];
    const n = grupo ? nivelCuerpo(intensidad[grupo]) : 0;
    const fill = SIN_COLOR.has(musculo) ? PIEL_CUERPO : ESCALA_CUERPO[n];
    const titulo = grupo ? `<title>${grupo}</title>` : '';
    s += `<g fill="${fill}"${n ? ' class="activo"' : ''}>${titulo}${caminos.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  }
  return s;
}

/**
 * intensidad: { Pecho: 0..1, ... }
 * opciones: { etiquetas: true } muestra "Frente" / "Espalda" debajo
 */
function cuerpoSVG(intensidad = {}, { etiquetas = true, clase = '' } = {}) {
  const alto = etiquetas ? 1330 : 1270;
  const nombres = Object.entries(intensidad).filter(([, v]) => v > 0).map(([m]) => m).join(', ');
  return `<svg class="cuerpo ${clase}" viewBox="40 88 1368 ${alto}" role="img" aria-label="${nombres ? 'Músculos: ' + nombres : 'Mapa muscular'}">
    <path d="${CUERPO_DATOS.contorno.front}" fill="${PIEL_CUERPO}"/>
    <path d="${CUERPO_DATOS.contorno.back}" fill="${PIEL_CUERPO}"/>
    <g stroke="${BORDE_CUERPO}" stroke-width="3" stroke-linejoin="round">
      ${ladoSVG(CUERPO_DATOS.frente, intensidad)}
      ${ladoSVG(CUERPO_DATOS.espalda, intensidad)}
    </g>
    ${etiquetas ? `<text x="362" y="1408" text-anchor="middle" class="cuerpo-txt">FRENTE</text><text x="1086" y="1408" text-anchor="middle" class="cuerpo-txt">ESPALDA</text>` : ''}
  </svg>`;
}

/** Intensidad de una sesión: músculo principal = 1, secundario = 0,5 */
function intensidadSesion(nombreSesion) {
  const out = {};
  for (const ej of RUTINA[nombreSesion] || []) {
    (MUSCULOS[ej.nombre] || []).forEach((m, i) => { out[m] = Math.max(out[m] || 0, i === 0 ? 1 : 0.5); });
  }
  return out;
}

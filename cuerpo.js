'use strict';

/* =====================================================================
 * Mapa del cuerpo (frente y espalda) en SVG, estilo segmentado.
 * Cada músculo se colorea según su intensidad (0–1) con una escala
 * secuencial de un solo tono (morado): más intenso = más claro y saturado.
 * ===================================================================== */

// Escala secuencial (5 pasos) sobre fondo oscuro. Índice 0 = sin trabajar.
const ESCALA_CUERPO = ['#231d2f', '#3b2766', '#5634a8', '#7b4fe6', '#a98cfb'];
const BORDE_CUERPO = '#0b0911';

// Piezas: [tipo, atributos, músculo | null (neutro)]
const E = (cx, cy, rx, ry, rot = 0) => ['ellipse', { cx, cy, rx, ry, transform: rot ? `rotate(${rot} ${cx} ${cy})` : null }];
const P = (d) => ['path', { d }];
const R = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];

const PIEZAS_COMUNES = [
  [E(60, 19, 11, 13), null],                         // cabeza
  [R(54, 30, 12, 10, 4), null],                      // cuello
  [E(26.5, 96, 5, 13, 12), null], [E(93.5, 96, 5, 13, -12), null],   // antebrazos
  [E(22.5, 114, 4.5, 5), null], [E(97.5, 114, 4.5, 5), null],        // manos
  [E(48.5, 230, 7, 4), null], [E(71.5, 230, 7, 4), null]             // pies
];

const FRENTE = [
  ...PIEZAS_COMUNES,
  [E(37, 50, 9.5, 8.5, -24), 'Hombro'], [E(83, 50, 9.5, 8.5, 24), 'Hombro'],
  [P('M44 45 Q52 41 59.2 43.5 L59.2 62 Q50 66.5 44.5 60.5 Q42 52 44 45 Z'), 'Pecho'],
  [P('M76 45 Q68 41 60.8 43.5 L60.8 62 Q70 66.5 75.5 60.5 Q78 52 76 45 Z'), 'Pecho'],
  [E(32, 70, 6, 12.5, 12), 'Bíceps'], [E(88, 70, 6, 12.5, -12), 'Bíceps'],
  [R(49, 65.5, 22, 36, 8), null],                                     // abdomen
  [E(45, 82, 3.6, 13), null], [E(75, 82, 3.6, 13), null],             // oblicuos
  [P('M47 103 L73 103 L70 114 Q60 120 50 114 Z'), null],              // pelvis
  [E(50, 145, 10, 28, 4), 'Cuádriceps'], [E(70, 145, 10, 28, -4), 'Cuádriceps'],
  [E(56.4, 131, 3.4, 14, 7), 'Aductores'], [E(63.6, 131, 3.4, 14, -7), 'Aductores'],
  [E(48.5, 199, 6.5, 23, 2), null], [E(71.5, 199, 6.5, 23, -2), null] // tibiales
];

const ESPALDA = [
  ...PIEZAS_COMUNES,
  [P('M49 39 L71 39 L83 47 L67 57 L53 57 L37 47 Z'), 'Espalda'],     // trapecio
  [P('M44 55 Q52 59.5 58.8 59.5 L58.8 90 Q50 92 46.5 86 Q41.5 71 44 55 Z'), 'Espalda'],
  [P('M76 55 Q68 59.5 61.2 59.5 L61.2 90 Q70 92 73.5 86 Q78.5 71 76 55 Z'), 'Espalda'],
  [E(37, 50, 9.5, 8.5, -24), 'Hombro'], [E(83, 50, 9.5, 8.5, 24), 'Hombro'],
  [E(32, 70, 6, 12.5, 12), 'Tríceps'], [E(88, 70, 6, 12.5, -12), 'Tríceps'],
  [R(50, 91, 20, 13, 5), null],                                       // lumbar
  [E(51.5, 115, 9.5, 10.5), 'Glúteo'], [E(68.5, 115, 9.5, 10.5), 'Glúteo'],
  [E(50, 151, 9.2, 23, 4), 'Femoral'], [E(70, 151, 9.2, 23, -4), 'Femoral'],
  [E(48.8, 195, 7.2, 19, 2), null], [E(71.2, 195, 7.2, 19, -2), null] // gemelos
];

function colorCuerpo(v) {
  if (!v || v <= 0) return ESCALA_CUERPO[0];
  return ESCALA_CUERPO[Math.min(4, Math.max(1, Math.ceil(v * 4)))];
}

function figuraSVG(piezas, intensidad, dx) {
  return piezas.map(([[tipo, attrs], musculo]) => {
    const fill = musculo ? colorCuerpo(intensidad[musculo]) : ESCALA_CUERPO[0];
    const a = Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}="${v}"`).join(' ');
    const titulo = musculo ? `<title>${musculo}</title>` : '';
    return `<${tipo} ${a} fill="${fill}" stroke="${BORDE_CUERPO}" stroke-width="1.6"${musculo ? ` data-musculo="${musculo}"` : ''}>${titulo}</${tipo}>`;
  }).join('').replace(/^/, `<g transform="translate(${dx} 0)">`) + '</g>';
}

/**
 * intensidad: { Pecho: 0..1, ... }
 * opciones: { etiquetas: true } muestra "Frente" / "Espalda" debajo
 */
function cuerpoSVG(intensidad = {}, { etiquetas = true, clase = '' } = {}) {
  const alto = etiquetas ? 252 : 238;
  const nombres = Object.entries(intensidad).filter(([, v]) => v > 0).map(([m]) => m).join(', ');
  return `<svg class="cuerpo ${clase}" viewBox="0 0 240 ${alto}" role="img" aria-label="${nombres ? 'Músculos: ' + nombres : 'Mapa muscular'}">
    ${figuraSVG(FRENTE, intensidad, 0)}
    ${figuraSVG(ESPALDA, intensidad, 120)}
    ${etiquetas ? `<text x="60" y="248" text-anchor="middle" class="cuerpo-txt">FRENTE</text><text x="180" y="248" text-anchor="middle" class="cuerpo-txt">ESPALDA</text>` : ''}
  </svg>`;
}

/** Intensidad de una sesión: músculo principal = 1, secundario = 0,5 */
function intensidadSesion(nombreSesion) {
  const out = {};
  for (const ej of RUTINA[nombreSesion]) {
    (MUSCULOS[ej.nombre] || []).forEach((m, i) => { out[m] = Math.max(out[m] || 0, i === 0 ? 1 : 0.5); });
  }
  return out;
}

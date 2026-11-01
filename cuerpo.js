'use strict';

/* =====================================================================
 * Mapa anatómico del cuerpo (frente y espalda) en SVG.
 * Dibujo propio: silueta + músculos con su forma. Solo se define el lado
 * izquierdo de cada figura; el derecho es su reflejo.
 * Cada músculo se colorea según su intensidad (0–1) con una escala
 * secuencial de un solo tono (morado): más intenso = más claro y saturado.
 * ===================================================================== */

// Escala secuencial (5 pasos) sobre fondo oscuro. Índice 0 = sin trabajar.
const ESCALA_CUERPO = ['#302a3f', '#432a73', '#5e36b4', '#7f52e8', '#ad91fb'];
const PIEL_CUERPO = '#211c2c';      // silueta
const BORDE_CUERPO = '#0b0911';     // separación entre músculos

// Silueta (medio cuerpo izquierdo, eje en x = 100)
const SILUETA = [
  'M100 10 C86 10 78 22 78 38 C78 52 84 62 90 66 L90 74 C78 80 64 82 54 86 C40 92 34 106 36 124 C36 146 36 166 40 182 C32 204 26 232 24 262 C22 274 20 286 22 296 C26 306 36 304 38 294 C40 282 40 270 40 262 C46 236 54 212 58 186 C62 168 62 148 62 132 C64 150 66 176 70 206 C68 220 66 232 66 246 C60 280 60 312 66 340 C64 366 66 392 72 418 C66 426 64 434 72 438 L92 438 C96 432 94 424 91 418 C94 392 95 366 93 342 C96 316 98 280 100 248 Z'
];

// Piezas: [d, músculo | null (neutro)] — lado izquierdo de la figura
const FRENTE_IZQ = [
  ['M90 70 C82 78 70 82 58 86 C66 90 74 90 80 88 C86 84 90 80 92 76 Z', 'Espalda'],              // trapecio (visto de frente)
  ['M57 87 C43 91 37 105 39 124 C45 118 53 112 61 108 C65 100 69 94 76 89 C70 89 63 88 57 87 Z', 'Hombro'],     // deltoides
  ['M99 90 L99 129 C88 136 74 134 65 124 C62 114 63 106 66 100 C71 92 82 88 99 90 Z', 'Pecho'],        // pectoral
  ['M46 121 C40 139 40 159 44 175 C50 177 56 173 58 167 C62 149 62 129 61 112 C54 114 48 117 46 121 Z', 'Bíceps'],
  ['M42 180 C34 200 28 230 27 260 L37 262 C41 236 49 210 56 182 C51 184 46 184 42 180 Z', null],     // antebrazo
  ['M99 134 L87 136 C85 160 85 198 88 224 C92 230 96 232 99 232 Z', null],                          // recto abdominal
  ['M84 136 C75 137 67 133 64 127 C64 150 66 178 70 204 C76 213 82 219 87 225 C84 199 84 160 84 136 Z', null], // oblicuo
  ['M70 236 C64 262 62 298 68 332 C75 343 85 345 91 338 C93 314 92 284 90 258 C84 250 78 244 70 236 Z', 'Cuádriceps'],
  ['M91 252 C92 272 93 294 94 312 C96 296 98 274 99.5 250 C96 248 93 249 91 252 Z', 'Aductores'],
  ['M72 350 C68 372 70 398 75 416 L87 416 C90 396 92 370 90 348 C85 352 78 352 72 350 Z', null],      // tibial / gemelo
  ['M78 342 C76 346 76 350 80 352 C86 352 90 350 92 346 C88 342 82 341 78 342 Z', null]              // rodilla
];

const ESPALDA_IZQ = [
  ['M99 64 C94 74 82 82 60 88 C72 96 84 110 92 138 L99 152 Z', 'Espalda'],                                         // trapecio
  ['M57 87 C43 91 37 105 39 124 C45 118 53 112 61 108 C65 100 69 94 76 89 C70 89 63 88 57 87 Z', 'Hombro'],     // deltoides posterior
  ['M63 102 C70 105 80 111 88 119 C84 129 76 133 67 131 C63 122 62 112 63 102 Z', 'Espalda'],                     // infraespinoso / redondo
  ['M66 134 C76 138 86 134 91 128 L97 152 L99 198 C90 203 80 196 74 186 C68 168 66 151 66 134 Z', 'Espalda'],    // dorsal ancho
  ['M99 202 L87 204 C85 214 86 226 90 232 L99 234 Z', null],                                                        // lumbar
  ['M46 121 C40 139 40 161 46 177 C52 179 58 175 60 167 C62 147 62 127 61 111 C54 113 48 116 46 121 Z', 'Tríceps'],
  ['M42 180 C34 200 28 230 27 260 L37 262 C41 236 49 210 56 182 C51 184 46 184 42 180 Z', null],                 // antebrazo
  ['M99 238 C88 231 74 233 68 245 C64 259 68 276 80 282 C90 286 98 282 99 276 Z', 'Glúteo'],
  ['M70 286 C66 302 66 320 71 336 C79 343 88 343 92 335 C95 318 96 301 95 288 C88 292 78 292 70 286 Z', 'Femoral'],
  ['M72 350 C64 366 66 384 74 398 C80 404 87 402 90 392 C93 376 92 360 89 348 C84 352 78 352 72 350 Z', null],   // gemelo
  ['M76 400 C74 408 74 414 76 418 L88 418 C90 412 90 406 88 400 C84 404 80 404 76 400 Z', null]                  // tendón
];

function colorCuerpo(v) {
  if (!v || v <= 0) return ESCALA_CUERPO[0];
  return ESCALA_CUERPO[Math.min(4, Math.max(1, Math.ceil(v * 4)))];
}

function piezasSVG(piezas, intensidad) {
  return piezas.map(([d, musculo]) => {
    const fill = musculo ? colorCuerpo(intensidad[musculo]) : ESCALA_CUERPO[0];
    const activo = musculo && intensidad[musculo] > 0;
    return `<path d="${d}" fill="${fill}"${activo ? ' class="activo"' : ''}>${musculo ? `<title>${musculo}</title>` : ''}</path>`;
  }).join('');
}

/** Una figura completa: silueta + músculos del lado izquierdo y su reflejo */
function figuraAnatomica(piezas, intensidad, dx, extra = '') {
  const lado = `<g stroke="${BORDE_CUERPO}" stroke-width="1.5" stroke-linejoin="round">${piezasSVG(piezas, intensidad)}${extra}</g>`;
  const silueta = `<path d="${SILUETA[0]}" fill="${PIEL_CUERPO}"/>`;
  return `<g transform="translate(${dx} 0)">
    <ellipse cx="100" cy="38" rx="21" ry="27" fill="${PIEL_CUERPO}"/>
    ${silueta}<g transform="translate(200 0) scale(-1 1)">${silueta}</g>
    ${lado}<g transform="translate(200 0) scale(-1 1)">${lado}</g>
  </g>`;
}

// Líneas de definición muscular (solo trazo), lado izquierdo de cada figura
const lineas = (d) => `<path d="${d}" fill="none" stroke="${BORDE_CUERPO}" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>`;
const DETALLE_FRENTE = lineas(
  'M87 158 L99 157 M87 182 L99 181 M88 205 L99 205' +          // abdominales
  'M66 93 C60 100 56 108 54 114' +                              // deltoides anterior / lateral
  'M66 141 L74 145 M66 151 L75 155 M67 161 L76 165' +           // serrato
  'M71 242 C79 266 86 294 90 320' +                             // sartorio
  'M89 302 C83 312 81 326 85 338' +                             // vasto medial
  'M73 288 C71 304 71 320 75 334' +                             // vasto lateral
  'M50 186 C42 210 36 236 33 258' +                             // antebrazo
  'M80 353 C78 372 79 392 82 414'                               // tibial / gemelo
);
const DETALLE_ESPALDA = lineas(
  'M52 121 C50 140 50 158 54 172' +                             // cabezas del tríceps
  'M82 291 C82 308 82 324 81 340' +                             // femorales
  'M80 355 C78 370 79 386 81 400' +                             // gemelos
  'M94 205 L94 231' +                                           // erectores
  'M50 186 C42 210 36 236 33 258'                               // antebrazo
);

/**
 * intensidad: { Pecho: 0..1, ... }
 * opciones: { etiquetas: true } muestra "Frente" / "Espalda" debajo
 */
function cuerpoSVG(intensidad = {}, { etiquetas = true, clase = '' } = {}) {
  const alto = etiquetas ? 470 : 446;
  const nombres = Object.entries(intensidad).filter(([, v]) => v > 0).map(([m]) => m).join(', ');
  return `<svg class="cuerpo ${clase}" viewBox="0 0 400 ${alto}" role="img" aria-label="${nombres ? 'Músculos: ' + nombres : 'Mapa muscular'}">
    ${figuraAnatomica(FRENTE_IZQ, intensidad, 0, DETALLE_FRENTE)}
    ${figuraAnatomica(ESPALDA_IZQ, intensidad, 200, DETALLE_ESPALDA)}
    ${etiquetas ? `<text x="100" y="464" text-anchor="middle" class="cuerpo-txt">FRENTE</text><text x="300" y="464" text-anchor="middle" class="cuerpo-txt">ESPALDA</text>` : ''}
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

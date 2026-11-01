'use strict';

/* =====================================================================
 * Gráfico de línea en SVG (sin librerías, funciona sin internet).
 * Una serie, un eje Y, puntos por día y tooltip al tocar.
 * ===================================================================== */

const COLOR_SERIE = '#9b6cf6';   // validado sobre el fondo oscuro de las tarjetas
const COLOR_SUPERFICIE = '#121019';

/** Escala "bonita": ~4 marcas con pasos 1/2/2,5/5/10 */
function escalaY(min, max) {
  if (min === max) { min = min - 1; max = max + 1; }
  const bruto = (max - min) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto / mag;
  const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  let lo = Math.floor(min / paso) * paso;
  let hi = Math.ceil(max / paso) * paso;
  if (lo === min && lo - paso >= 0) lo -= paso;   // aire bajo el mínimo
  if (hi === max) hi += paso;                      // aire sobre el máximo
  if (lo < 0) lo = 0;
  const marcas = [];
  for (let v = lo; v <= hi + paso / 2; v += paso) marcas.push(Math.round(v * 100) / 100);
  return { lo, hi, marcas };
}

/**
 * puntos: [{ fecha: "2026-11-03", valor: 62.5, detalle: "60×8 · 62,5×7" }]
 * opciones: { formato: (v) => "62,5 kg" }
 */
function dibujarGrafico(contenedor, puntos, { formato }) {
  const W = Math.max(280, Math.round(contenedor.clientWidth || 340));
  const H = 230;
  const m = { l: 44, r: 14, t: 26, b: 28 };
  const ancho = W - m.l - m.r;
  const alto = H - m.t - m.b;

  const tiempos = puntos.map((p) => deISO(p.fecha).getTime());
  let t0 = Math.min(...tiempos);
  let t1 = Math.max(...tiempos);
  if (t0 === t1) { t0 -= 3 * 86400000; t1 += 3 * 86400000; }
  const valores = puntos.map((p) => p.valor);
  const { lo, hi, marcas } = escalaY(Math.min(...valores), Math.max(...valores));

  const X = (t) => m.l + ((t - t0) / (t1 - t0)) * ancho;
  const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * alto;
  const xs = tiempos.map(X);
  const ys = valores.map(Y);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución">`;

  // Rejilla y eje Y
  for (const v of marcas) {
    const y = Y(v);
    svg += `<line class="rejilla" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
    svg += `<text class="eje" x="${m.l - 8}" y="${y + 4}" text-anchor="end">${num(v)}</text>`;
  }

  // Eje X: hasta 4 fechas
  const nMarcas = Math.min(4, puntos.length === 1 ? 1 : 4);
  const fechasX = [];
  if (puntos.length <= 4) {
    puntos.forEach((p, i) => fechasX.push({ x: xs[i], f: p.fecha }));
  } else {
    for (let i = 0; i < nMarcas; i++) {
      const t = t0 + ((t1 - t0) * i) / (nMarcas - 1);
      fechasX.push({ x: X(t), f: aISO(new Date(t)) });
    }
  }
  fechasX.forEach(({ x, f }, i) => {
    const anchor = fechasX.length > 1 && i === 0 ? 'start' : fechasX.length > 1 && i === fechasX.length - 1 ? 'end' : 'middle';
    const xx = anchor === 'start' ? Math.max(x - 4, m.l - 4) : anchor === 'end' ? Math.min(x + 4, W - 2) : x;
    svg += `<text class="eje" x="${xx}" y="${H - 8}" text-anchor="${anchor}">${fechaCorta(f)}</text>`;
  });

  // Área (velo al 10 %) y línea
  if (puntos.length > 1) {
    const linea = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join('');
    const base = m.t + alto;
    const idG = 'area-' + Math.random().toString(36).slice(2, 8);
    svg += `<defs><linearGradient id="${idG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLOR_SERIE}" stop-opacity=".16"/><stop offset="1" stop-color="${COLOR_SERIE}" stop-opacity="0"/></linearGradient></defs>`;
    svg += `<path d="${linea}L${xs[xs.length - 1].toFixed(1)},${base}L${xs[0].toFixed(1)},${base}Z" fill="url(#${idG})"/>`;
    svg += `<path d="${linea}" fill="none" stroke="${COLOR_SERIE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  // Puntos (con anillo del color de la superficie)
  const conPuntos = puntos.length <= 60;
  xs.forEach((x, i) => {
    if (conPuntos || i === xs.length - 1) {
      svg += `<circle cx="${x}" cy="${ys[i]}" r="4" fill="${COLOR_SERIE}" stroke="${COLOR_SUPERFICIE}" stroke-width="2"/>`;
    }
  });

  // Etiqueta del último valor
  const ux = xs[xs.length - 1], uy = ys[ys.length - 1];
  svg += `<text class="etiqueta-fin" x="${Math.min(ux, W - m.r)}" y="${Math.max(uy - 12, 12)}" text-anchor="${puntos.length > 1 ? 'end' : 'middle'}">${esc(formato(valores[valores.length - 1]))}</text>`;

  // Capa de interacción
  svg += `<line class="cruz" x1="0" x2="0" y1="${m.t}" y2="${m.t + alto}" stroke="#4b4360" stroke-width="1" visibility="hidden"/>`;
  svg += `<circle class="foco" r="6" fill="${COLOR_SERIE}" stroke="${COLOR_SUPERFICIE}" stroke-width="2" visibility="hidden"/>`;
  svg += `<rect class="tactil" x="${m.l - 10}" y="0" width="${ancho + 20}" height="${H}" fill="transparent"/>`;
  svg += '</svg>';

  contenedor.innerHTML = svg + '<div class="tooltip" hidden></div>';

  const el = contenedor.querySelector('svg');
  const cruz = el.querySelector('.cruz');
  const foco = el.querySelector('.foco');
  const tip = contenedor.querySelector('.tooltip');

  function mostrar(evt) {
    const r = el.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * W;
    let i = 0;
    for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - px) < Math.abs(xs[i] - px)) i = k;
    cruz.setAttribute('x1', xs[i]); cruz.setAttribute('x2', xs[i]); cruz.setAttribute('visibility', 'visible');
    foco.setAttribute('cx', xs[i]); foco.setAttribute('cy', ys[i]); foco.setAttribute('visibility', 'visible');
    const p = puntos[i];
    tip.innerHTML = `<div class="t-fecha">${esc(fechaMedia(p.fecha))}${p.pendiente ? ' · pendiente' : ''}</div><b>${esc(formato(p.valor))}</b>${p.detalle ? `<div>${esc(p.detalle)}</div>` : ''}`;
    tip.hidden = false;
    const escala = r.width / W;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = xs[i] * escala - tw / 2;
    left = Math.max(0, Math.min(left, r.width - tw));
    let top = ys[i] * escala - th - 14;
    if (top < 0) top = ys[i] * escala + 14;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function ocultar() {
    cruz.setAttribute('visibility', 'hidden');
    foco.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  }
  const tactil = el.querySelector('.tactil');
  tactil.addEventListener('pointerdown', mostrar);
  tactil.addEventListener('pointermove', mostrar);
  tactil.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') ocultar(); });
}

/**
 * experimentos.mjs — Las pruebas del artículo (se corren con: node scripts/experimentos.mjs)
 *
 * Todo se hace con el canal simulado de lib/canal.js y una semilla fija, para que los
 * números se puedan repetir. Guarda los resultados en scripts/resultados.json.
 */
import { writeFileSync } from 'node:fs';
import {
  FS, N, GUARDA, SIMBOLO, TONOS, BIN0, SEP, AMPLITUD, CHIRP, CHIRP_LARGO,
  codificar, recibir, buscarChirp, detectarSimbolo, duracionMensaje, BITS_POR_SEGUNDO,
} from '../lib/modem.js';
import { fft } from '../lib/fft.js';
import { azarConSemilla, gauss, agregarRuido, pasarPorCanal, potencia, respuestaCuarto, convolucion } from '../lib/canal.js';
import { aGray, desdeGray } from '../lib/codigo.js';

const azar = azarConSemilla(2026);
const res = {};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s]`, ...a);

// ─────────── Teoría: M-FSK no coherente en ruido blanco ───────────
// Ps = Σ_{n=1}^{M-1} (-1)^{n+1} C(M-1,n) / (n+1) · exp(-n/(n+1) · Es/N0)
// Pb = M / (2(M-1)) · Ps
function comb(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
export function psTeorica(M, esn0) {
  let s = 0;
  for (let n = 1; n <= M - 1; n++) s += ((-1) ** (n + 1) * comb(M - 1, n) / (n + 1)) * Math.exp((-n / (n + 1)) * esn0);
  return Math.max(0, s);
}
const pbTeorica = (M, esn0) => (M / (2 * (M - 1))) * psTeorica(M, esn0);
const contarBits = (a, b) => { let x = a ^ b, c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

// ─────────── 1) Errores de símbolo y de bit vs SNR (sin código, sincronía perfecta) ───────────
function generarTonos(simbolos, { n = N, guarda = GUARDA, bin0 = BIN0, sep = SEP } = {}) {
  const largo = n + guarda;
  const x = new Float32Array(simbolos.length * largo);
  let fase = 0;
  simbolos.forEach((s, j) => {
    const w = (2 * Math.PI * ((bin0 + sep * s) * FS) / n) / FS;
    for (let k = 0; k < largo; k++) { x[j * largo + k] = AMPLITUD * Math.sin(fase); fase += w; }
  });
  return x;
}

// detector genérico (para probar otros tamaños de ventana)
function detectarGenerico(x, desde, n, bin0, sep) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < n; k++) re[k] = (x[desde + k] ?? 0) * 0.5 * (1 - Math.cos((2 * Math.PI * k) / (n - 1)));
  fft(re, im);
  let mejor = 0, emax = -1;
  for (let i = 0; i < TONOS; i++) {
    const c = bin0 + sep * i;
    let e = 0;
    for (let j = c - 1; j <= c + 1; j++) e += re[j] * re[j] + im[j] * im[j];
    if (e > emax) { emax = e; mejor = i; }
  }
  return mejor;
}

{
  log('1) SER/BER vs SNR');
  const snrs = [-30, -28, -26, -24, -22, -20, -18, -16, -14, -12];
  const filas = [];
  const NS = 3000;
  for (const snr of snrs) {
    const sim = Array.from({ length: NS }, () => Math.floor(azar() * 16));
    const tx = sim.map(aGray);
    const x = generarTonos(tx);
    const y = agregarRuido(x, snr, { azar });
    let errS = 0, errB = 0;
    for (let j = 0; j < NS; j++) {
      const d = detectarSimbolo(y, j * SIMBOLO + GUARDA).tono;
      const v = desdeGray(d);
      if (v !== sim[j]) { errS++; errB += contarBits(v, sim[j]); }
    }
    const esn0 = 10 ** (snr / 10) * (N / 2);
    filas.push({ snr, ser: errS / NS, ber: errB / (4 * NS), serTeo: psTeorica(16, esn0), berTeo: pbTeorica(16, esn0), esn0dB: 10 * Math.log10(esn0) });
    log(snr, filas.at(-1));
  }
  res.berVsSnr = filas;
}

// ─────────── 2) Mensajes completos: con y sin protección (Hamming + intercalado) ───────────
{
  log('2) mensajes completos');
  const texto = 'Hola desde la CUC: datos por sonido';
  const { simbolos } = codificar(texto);
  const filas = [];
  const PRUEBAS = 60;
  for (const snr of [-22, -20, -18, -16, -14, -12, -10]) {
    let okCod = 0, okSin = 0, sincOk = 0;
    for (let p = 0; p < PRUEBAS; p++) {
      const { senal } = codificar(texto);
      const retraso = 3000 + Math.floor(azar() * 6000);
      const y = pasarPorCanal(senal, { snrDb: snr, retraso, azar });
      const r = recibir(y, { minCalidad: 0 });
      if (r.inicio !== undefined && Math.abs(r.inicio - retraso) < 40) sincOk++;
      if (r.estado === 'ok' && r.texto === texto) okCod++;
      // "sin protección": el mensaje llega bien solo si TODOS los símbolos se detectan bien
      if (r.simbolos) {
        const cuerpo = simbolos.slice(6);
        const todos = r.simbolos.every((s, i) => s.tono === cuerpo[i]);
        // los símbolos de un mensaje sin código serían 7/4 menos; corregimos la probabilidad:
        // P(ok sin código) ≈ (1 − SER)^(símbolos sin código)
        if (todos) okSin++;
      }
    }
    filas.push({ snr, exitoConCodigo: okCod / PRUEBAS, todosSimbolosBien: okSin / PRUEBAS, sincronia: sincOk / PRUEBAS });
    log(snr, filas.at(-1));
  }
  res.mensajes = { texto, bytes: new TextEncoder().encode(texto).length, simbolos: simbolos.length, filas };
}

// ─────────── 3) Eco del cuarto: con y sin guarda, cerca (DRR +6 dB) y lejos (DRR 0 dB) ───────────
{
  log('3) eco');
  const filas = [];
  const NS = 1500;
  for (const drrDb of [6, 0]) {
    for (const rt60 of [0, 0.2, 0.4, 0.6, 0.8]) {
      const sim = Array.from({ length: NS }, () => Math.floor(azar() * 16));
      const x = generarTonos(sim);
      const h = respuestaCuarto(rt60, FS, { azar, drrDb });
      let y = rt60 > 0 ? convolucion(x, h).slice(0, x.length) : x;
      y = agregarRuido(y, 0, { azar, refPotencia: potencia(x) });
      let errCon = 0, errSin = 0;
      for (let j = 0; j < NS; j++) {
        if (detectarSimbolo(y, j * SIMBOLO + GUARDA).tono !== sim[j]) errCon++;
        if (detectarSimbolo(y, j * SIMBOLO).tono !== sim[j]) errSin++;
      }
      filas.push({ drrDb, rt60, serConGuarda: errCon / NS, serSinGuarda: errSin / NS });
      log(filas.at(-1));
    }
  }
  // mensajes completos dentro de un cuarto (SNR 0 dB)
  const texto = 'Hola desde la CUC: datos por sonido';
  const mensajes = [];
  for (const drrDb of [6, 0]) {
    for (const rt60 of [0.2, 0.4, 0.6]) {
      let ok = 0, corr = 0;
      const P = 30;
      for (let p = 0; p < P; p++) {
        const { senal } = codificar(texto);
        const r = recibir(pasarPorCanal(senal, { snrDb: 0, rt60, drrDb, retraso: 4000, azar }), { minCalidad: 0 });
        if (r.estado === 'ok' && r.texto === texto) ok++;
        corr += r.corregidos ?? 0;
      }
      mensajes.push({ drrDb, rt60, exito: ok / P, corregidosPromedio: corr / P });
      log(mensajes.at(-1));
    }
  }
  res.eco = { simbolos: filas, mensajes };
}

// ─────────── 4) Tamaño de ventana: velocidad vs robustez ───────────
{
  log('4) ventana');
  const filas = [];
  for (const n of [256, 512, 1024, 2048]) {
    const esc = n / 1024;
    const bin0 = Math.round(BIN0 * esc), sep = Math.max(1, Math.round(SEP * esc));
    const guarda = Math.round(GUARDA * 1); // misma guarda en tiempo (10,7 ms)
    const largo = n + guarda;
    const NS = 2000;
    const fila = { n, duracionMs: (1000 * largo) / FS, bps: (4 * FS) / largo, separacionHz: (sep * FS) / n, ser: {} };
    for (const snr of [-20, -15, -10]) {
      const sim = Array.from({ length: NS }, () => Math.floor(azar() * 16));
      const x = generarTonos(sim, { n, guarda, bin0, sep });
      const h = respuestaCuarto(0.3, FS, { azar });
      let y = convolucion(x, h).slice(0, x.length);
      y = agregarRuido(y, snr, { azar, refPotencia: potencia(x) });
      let e = 0;
      for (let j = 0; j < NS; j++) if (detectarGenerico(y, j * largo + guarda, n, bin0, sep) !== sim[j]) e++;
      fila.ser[snr] = e / NS;
    }
    filas.push(fila);
    log(n, fila);
  }
  res.ventana = filas;
}

// ─────────── 5) Sincronización: falsas alarmas y detección ───────────
{
  log('5) sincronía');
  // a) solo ruido y b) solo tonos de datos (sin chirp): ¿cuánto llegan a parecerse al chirp?
  const sinChirp = [];
  for (let p = 0; p < 100; p++) {
    const x = new Float32Array(Math.round(FS * 2.5));
    for (let n = 0; n < x.length; n++) x[n] = 0.1 * gauss(azar);
    const r = buscarChirp(x, { minCalidad: 0, minRho: 0 });
    sinChirp.push({ tipo: 'ruido', calidad: r.calidad, rho: r.rho });
  }
  for (let p = 0; p < 60; p++) {
    const { senal } = codificar('mensaje de prueba número ' + p + ' con varios datos');
    const y = pasarPorCanal(senal, { snrDb: [30, 10, 0][p % 3], rt60: 0.3, retraso: 0, azar });
    const ini = CHIRP_LARGO + 3000;
    const r = buscarChirp(y.slice(ini, ini + Math.round(FS * 2.5)), { minCalidad: 0, minRho: 0 });
    sinChirp.push({ tipo: 'datos', calidad: r.calidad, rho: r.rho });
  }
  const maxDe = (t, k) => Math.max(...sinChirp.filter((s) => s.tipo === t).map((s) => s[k]));
  const falsas = sinChirp.filter((s) => s.calidad >= 10 && s.rho >= 0.15).length;

  const conChirp = [];
  for (const snr of [-24, -21, -18, -15, -12, -9, -6, 0]) {
    let det = 0;
    const errT = [];
    const P = 60;
    for (let p = 0; p < P; p++) {
      const x = new Float32Array(Math.round(FS * 2.5));
      const ret = 4000 + Math.floor(azar() * 8000);
      for (let n = 0; n < CHIRP_LARGO; n++) x[ret + n] = AMPLITUD * CHIRP[n];
      const ps = potencia(x, ret, ret + CHIRP_LARGO);
      const y = agregarRuido(x, snr, { azar, refPotencia: ps });
      const r = buscarChirp(y);
      if (r && Math.abs(r.inicio - ret) < 24) {
        det++;
        errT.push(Math.abs(r.inicio - ret));
      }
    }
    conChirp.push({ snr, deteccion: det / P, errorMedioMuestras: errT.length ? errT.reduce((a, b) => a + b, 0) / errT.length : null });
    log(conChirp.at(-1));
  }
  res.sincronia = {
    ruido: { calidadMax: maxDe('ruido', 'calidad'), rhoMax: maxDe('ruido', 'rho') },
    datos: { calidadMax: maxDe('datos', 'calidad'), rhoMax: maxDe('datos', 'rho') },
    pruebasSinChirp: sinChirp.length,
    falsasAlarmas: falsas,
    conChirp,
  };
  log(res.sincronia);
}

// ─────────── 6) Velocidad real y capacidad de Shannon ───────────
{
  const filas = [];
  for (const L of [1, 5, 10, 20, 35, 60, 120]) filas.push({ bytes: L, segundos: duracionMensaje(L), bpsUtil: (8 * L) / duracionMensaje(L) });
  const B = (TONOS * SEP * FS) / N; // ancho de banda ocupado ≈ 1500 Hz
  const shannon = [0, 10, 20].map((snrBanda) => ({ snrBanda, capacidad: B * Math.log2(1 + 10 ** (snrBanda / 10)) }));
  res.velocidad = { bitsPorSegundoBruto: BITS_POR_SEGUNDO, anchoBanda: B, filas, shannon };
  log(res.velocidad);
}

writeFileSync(new URL('./resultados.json', import.meta.url), JSON.stringify(res, null, 2));
log('listo');

/**
 * canal.js — Un "aire de mentira" para probar el módem sin parlante ni micrófono
 * ============================================================================
 *
 * En la vida real, entre el parlante y el micrófono el sonido se ensucia:
 *   - RUIDO:   se suma un zumbido aleatorio (ventiladores, gente hablando…).
 *   - ECO:     el sonido rebota en las paredes y llega varias veces, cada vez más débil.
 *   - DESFASE: el micrófono empieza a grabar en cualquier momento, no justo al inicio.
 *
 * Aquí simulamos todo eso con fórmulas sencillas:
 *   r[n] = (h * s)[n] + w[n]
 * donde h es la "respuesta del cuarto" (los ecos) y w es ruido blanco gaussiano.
 */

import { fft } from './fft.js';

/** Número aleatorio con distribución normal (media 0, varianza 1). Método de Box–Muller. */
export function gauss(azar = Math.random) {
  const u = 1 - azar();
  const v = azar();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Generador pseudoaleatorio con semilla (para que los experimentos se puedan repetir). */
export function azarConSemilla(semilla = 1) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Potencia media de una señal:  P = (1/L) Σ x[n]² */
export function potencia(x, desde = 0, hasta = x.length) {
  let p = 0;
  for (let n = desde; n < hasta; n++) p += x[n] * x[n];
  return p / Math.max(1, hasta - desde);
}

/**
 * Suma ruido blanco para lograr una relación señal/ruido dada (en dB):
 *   SNR_dB = 10·log10(P_señal / P_ruido)  →  σ = sqrt(P_señal / 10^(SNR/10))
 * La potencia de la señal se mide solo donde hay señal (refPotencia si se da).
 */
export function agregarRuido(x, snrDb, { azar = Math.random, refPotencia } = {}) {
  const ps = refPotencia ?? potencia(x);
  const sigma = Math.sqrt(ps / 10 ** (snrDb / 10));
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) y[n] = x[n] + sigma * gauss(azar);
  return y;
}

/**
 * Crea la respuesta de un cuarto: el camino directo más una "cola" de ecos que se
 * apagan de forma exponencial (modelo estadístico de reverberación):
 *   h[n] = δ[n] + c · g[n] · e^(−6,91·n / (RT60·FS))      para n ≥ 2 ms
 * g[n] es ruido gaussiano (los rebotes llegan desordenados) y c se ajusta para que
 * la relación entre la energía directa y la de los ecos (DRR) sea la pedida.
 * Cerca del parlante (≈ 0,5 m) la DRR es alta (≈ +6 dB); a varios metros es baja (≈ 0 dB).
 *
 * @param {number} rt60   tiempo (s) en que el eco cae 60 dB (cuarto normal ≈ 0,3–0,6 s)
 * @param {number} fs     frecuencia de muestreo
 * @param {number} drrDb  relación directo/eco en dB
 */
export function respuestaCuarto(rt60, fs, { azar = Math.random, drrDb = 6 } = {}) {
  const largo = Math.max(1, Math.round(rt60 * fs));
  const h = new Float32Array(largo);
  h[0] = 1;
  if (rt60 <= 0) return h;
  let energia = 0;
  for (let n = Math.round(0.002 * fs); n < largo; n++) {
    h[n] = gauss(azar) * Math.exp((-6.91 * n) / (rt60 * fs));
    energia += h[n] * h[n];
  }
  const c = Math.sqrt(10 ** (-drrDb / 10) / energia);
  for (let n = 1; n < largo; n++) h[n] *= c;
  return h;
}

/**
 * Convolución y = h * x usando la FFT (mucho más rápida que la suma directa):
 *   y = IFFT( FFT(x) · FFT(h) )
 */
export function convolucion(x, h) {
  const L = x.length + h.length - 1;
  let M = 1;
  while (M < L) M <<= 1;
  const xr = new Float64Array(M), xi = new Float64Array(M);
  const hr = new Float64Array(M), hi = new Float64Array(M);
  xr.set(x);
  hr.set(h);
  fft(xr, xi);
  fft(hr, hi);
  for (let k = 0; k < M; k++) {
    const a = xr[k], b = xi[k];
    xr[k] = a * hr[k] - b * hi[k];
    xi[k] = -(a * hi[k] + b * hr[k]); // se conjuga para hacer la IFFT con la FFT
  }
  fft(xr, xi);
  const y = new Float32Array(L);
  for (let n = 0; n < L; n++) y[n] = xr[n] / M;
  return y;
}

/** Pone la señal dentro de una grabación más larga, empezando en "retraso" muestras. */
export function conRetraso(x, retraso, colaFinal = 2000) {
  const y = new Float32Array(retraso + x.length + colaFinal);
  y.set(x, retraso);
  return y;
}

/**
 * Canal completo: retraso → ecos → ruido.
 * La SNR se mide contra la potencia de la señal transmitida (sin silencios).
 */
export function pasarPorCanal(senal, { snrDb = 20, rt60 = 0, drrDb = 6, retraso = 5000, fs = 24000, azar = Math.random } = {}) {
  const ps = potencia(senal);
  let y = conRetraso(senal, retraso);
  if (rt60 > 0) y = convolucion(y, respuestaCuarto(rt60, fs, { azar, drrDb })).slice(0, y.length);
  return agregarRuido(y, snrDb, { azar, refPotencia: ps });
}

/**
 * modem.js — El "módem acústico": convierte mensajes en sonido y sonido en mensajes
 * ================================================================================
 *
 * La idea es la misma de los módems telefónicos de antes: cada grupo de bits se envía
 * como un TONO de una frecuencia distinta (modulación por desplazamiento de frecuencia,
 * MFSK). El receptor escucha, usa la FFT para ver qué frecuencia suena en cada momento
 * y así recupera los bits.
 *
 * Así se ve un mensaje en el tiempo:
 *
 *   [ chirp ][silencio][ encabezado: largo del mensaje ][ cuerpo: datos + CRC ]
 *     0,25 s   0,05 s        6 símbolos                    N símbolos
 *
 *   - El CHIRP es un "barrido" de 1 a 4 kHz (suena como un "fiuuu"). Sirve para que el
 *     receptor sepa exactamente en qué instante empieza el mensaje.
 *   - Cada SÍMBOLO es un tono de 53 ms que lleva 4 bits (hay 16 tonos posibles).
 *
 * Fórmulas principales (ver el artículo):
 *   tono i:            f_i = (BIN0 + SEP·i) · FS / N
 *   señal transmitida: s(t) = A · cos(φ(t)),  con φ'(t) = 2π f(t)   (fase continua)
 *   detección:         î = argmax_i |X[k_i]|²   (X = FFT de la ventana del símbolo)
 *   sincronización:    τ = argmax_τ Σ r[n+τ] · c[n]   (correlación con el chirp)
 */

import { fft } from './fft.js';
import {
  textoABytes, bytesATexto, crc8, hammingCodificar, hammingDecodificar,
  intercalar, desintercalar, aGray, desdeGray, bytesANibbles, nibblesABytes,
  bitsANibbles, nibblesABits,
} from './codigo.js';

// ─────────────────────────────── Parámetros ───────────────────────────────

/** Frecuencia de muestreo interna (muestras por segundo). Nyquist = 12 kHz. */
export const FS = 24000;
/** Muestras que se analizan por símbolo (tamaño de la FFT). Δf = FS/N ≈ 23,4 Hz. */
export const N = 1024;
/** "Guarda": muestras extra al inicio de cada símbolo que el receptor ignora,
 *  para que el eco del símbolo anterior no lo confunda (≈ 10,7 ms). */
export const GUARDA = 256;
/** Duración total de un símbolo en muestras (≈ 53 ms). */
export const SIMBOLO = N + GUARDA;
/** Cantidad de tonos (16 → 4 bits por símbolo). */
export const TONOS = 16;
/** Bin de la FFT del primer tono (64 · 23,4 Hz = 1500 Hz). */
export const BIN0 = 64;
/** Separación entre tonos en bins (4 · 23,4 Hz = 93,75 Hz). */
export const SEP = 4;
/** Volumen de la señal (0 a 1). */
export const AMPLITUD = 0.6;

// chirp de sincronización
const CHIRP_F0 = 1000;
const CHIRP_F1 = 4000;
export const CHIRP_LARGO = Math.round(0.25 * FS);
const SILENCIO = Math.round(0.05 * FS);
const SIMBOLOS_ENCABEZADO = 6;
export const MAX_BYTES = 120;

/** Frecuencia en Hz del tono número i. */
export const frecuenciaTono = (i) => ((BIN0 + SEP * i) * FS) / N;

/** Bits por segundo (sin contar la protección). */
export const BITS_POR_SEGUNDO = (4 * FS) / SIMBOLO;

// ─────────────────────────────── El chirp ───────────────────────────────
// Frecuencia que sube en línea recta de f0 a f1:  f(t) = f0 + (f1 − f0)·t/T
// La fase es la integral: φ(t) = 2π (f0·t + (f1 − f0)·t² / (2T)).
// Los bordes se suavizan para que no suene un "clic".
function crearChirp() {
  const c = new Float32Array(CHIRP_LARGO);
  const T = CHIRP_LARGO / FS;
  const borde = Math.round(0.01 * FS);
  for (let n = 0; n < CHIRP_LARGO; n++) {
    const t = n / FS;
    const fase = 2 * Math.PI * (CHIRP_F0 * t + ((CHIRP_F1 - CHIRP_F0) * t * t) / (2 * T));
    let env = 1;
    if (n < borde) env = 0.5 * (1 - Math.cos((Math.PI * n) / borde));
    if (n > CHIRP_LARGO - borde) env = 0.5 * (1 - Math.cos((Math.PI * (CHIRP_LARGO - n)) / borde));
    c[n] = env * Math.sin(fase);
  }
  return c;
}
export const CHIRP = crearChirp();
const NORMA_CHIRP = Math.sqrt(CHIRP.reduce((a, v) => a + v * v, 0));

// ─────────────────────────────── Transmisor ───────────────────────────────

/**
 * Convierte un texto en la lista de símbolos (números de 0 a 15) que se van a enviar.
 * @returns {{ simbolos: number[], bytes: number[], encabezado: number[], cuerpo: number[] }}
 */
export function textoASimbolos(texto) {
  let bytes = textoABytes(texto);
  if (bytes.length > MAX_BYTES) bytes = bytes.slice(0, MAX_BYTES);
  if (bytes.length === 0) bytes = [32];

  // Encabezado: el largo del mensaje, cada mitad repetida 3 veces (alto, bajo, alto, bajo…)
  const largo = bytes.length;
  const alto = largo >> 4, bajo = largo & 15;
  const encabezado = [alto, bajo, alto, bajo, alto, bajo].map(aGray);

  // Cuerpo: datos + CRC → mitades de byte → Hamming → intercalado → grupos de 4 bits → Gray
  const conCrc = [...bytes, crc8(bytes)];
  const bloques = bytesANibbles(conCrc).map(hammingCodificar);
  const cuerpo = bitsANibbles(intercalar(bloques)).map(aGray);

  return { simbolos: [...encabezado, ...cuerpo], bytes, encabezado, cuerpo };
}

/** Cuántos símbolos de cuerpo tiene un mensaje de "largo" bytes. */
export function simbolosCuerpo(largo) {
  const bloques = 2 * (largo + 1); // (datos + CRC) · 2 mitades
  return Math.ceil((7 * bloques) / 4);
}

/** Duración en segundos del sonido para un mensaje de "largo" bytes. */
export function duracionMensaje(largo) {
  return (CHIRP_LARGO + SILENCIO + (SIMBOLOS_ENCABEZADO + simbolosCuerpo(largo)) * SIMBOLO) / FS;
}

/**
 * Genera el sonido (a 24 000 Hz) que transmite el texto.
 * Los tonos se generan con FASE CONTINUA: al cambiar de tono no hay saltos en la onda,
 * así no suenan "clics" ni se ensucia el espectro.
 * @returns {{ senal: Float32Array, simbolos: number[], bytes: number[] }}
 */
export function codificar(texto) {
  const { simbolos, bytes } = textoASimbolos(texto);
  const total = CHIRP_LARGO + SILENCIO + simbolos.length * SIMBOLO + Math.round(0.1 * FS);
  const senal = new Float32Array(total);

  senal.set(CHIRP.map((v) => v * AMPLITUD), 0);

  let fase = 0;
  let pos = CHIRP_LARGO + SILENCIO;
  const rampa = 48; // 2 ms de subida y bajada al inicio y al final de los datos
  const ultimo = simbolos.length * SIMBOLO;
  for (let s = 0; s < simbolos.length; s++) {
    const w = (2 * Math.PI * frecuenciaTono(simbolos[s])) / FS;
    for (let n = 0; n < SIMBOLO; n++) {
      const k = s * SIMBOLO + n;
      const env = Math.min(1, k / rampa, (ultimo - k) / rampa);
      senal[pos + n] = AMPLITUD * env * Math.sin(fase);
      fase += w;
    }
    fase %= 2 * Math.PI;
    pos += SIMBOLO;
  }
  return { senal, simbolos, bytes };
}

// ─────────────────────────────── Receptor ───────────────────────────────

/**
 * Busca el chirp dentro de la señal con una CORRELACIÓN (filtro adaptado):
 *     r[τ] = Σ x[n + τ] · c[n]
 * Donde la señal se parece al chirp, r es muy grande. Se calcula rápido con la FFT:
 *     r = IFFT( FFT(x) · conj(FFT(c)) )
 *
 * @param {Float32Array} senal  audio a 24 000 Hz
 * Se aceptan solo picos que cumplan DOS condiciones (así no se confunde con los tonos
 * de datos ni con ruido): calidad ≥ 10 y ρ ≥ 0,15.
 *
 * @returns {{ inicio: number, calidad: number, rho: number } | null}
 *   inicio = muestra donde empieza el chirp; calidad = qué tanto sobresale el pico
 *   sobre el resto (pico / desviación típica de la correlación); rho = parecido (0 a 1).
 */
export function buscarChirp(senal, { minCalidad = 10, minRho = 0.15 } = {}) {
  const L = senal.length;
  if (L < CHIRP_LARGO * 2) return null;
  let M = 1;
  while (M < L + CHIRP_LARGO) M <<= 1;

  const xr = new Float64Array(M), xi = new Float64Array(M);
  const cr = new Float64Array(M), ci = new Float64Array(M);
  xr.set(senal);
  cr.set(CHIRP);
  fft(xr, xi);
  fft(cr, ci);
  // producto con el conjugado: X · conj(C)
  for (let k = 0; k < M; k++) {
    const a = xr[k], b = xi[k], c = cr[k], d = -ci[k];
    xr[k] = a * c - b * d;
    xi[k] = a * d + b * c;
  }
  // IFFT usando la FFT: ifft(z) = conj(fft(conj(z))) / M
  for (let k = 0; k < M; k++) xi[k] = -xi[k];
  fft(xr, xi);

  // Correlación normalizada (entre −1 y 1): se divide por la energía de la señal en esa
  // ventana, para que un sonido fuerte cualquiera no parezca un chirp.
  //   ρ[τ] = r[τ] / ( ‖c‖ · sqrt(Σ x[n+τ]²) )
  const valida = L - CHIRP_LARGO;
  const acum = new Float64Array(L + 1);
  for (let n = 0; n < L; n++) acum[n + 1] = acum[n] + senal[n] * senal[n];
  let max = 0, inicio = 0, suma2 = 0, rhoMax = 0;
  for (let t = 0; t < valida; t++) {
    const r = xr[t] / M;
    suma2 += r * r;
    if (Math.abs(r) > max) {
      max = Math.abs(r);
      inicio = t;
    }
  }
  const energiaVentana = acum[inicio + CHIRP_LARGO] - acum[inicio];
  rhoMax = max / (NORMA_CHIRP * Math.sqrt(energiaVentana) + 1e-12);
  const sigma = Math.sqrt(suma2 / Math.max(1, valida));
  const calidad = max / (sigma + 1e-12);
  // (escrito al revés a propósito: si algo dio NaN, también se descarta)
  if (!(calidad >= minCalidad && rhoMax >= minRho)) return null;
  return { inicio, calidad, rho: rhoMax };
}

// Ventana de Hann para analizar cada símbolo
const VENTANA = Float64Array.from({ length: N }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1))));

/**
 * Escucha un símbolo: aplica la FFT a su ventana y elige el tono con más energía.
 * @returns {{ tono: number, energias: number[], confianza: number }}
 */
export function detectarSimbolo(senal, desde) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let n = 0; n < N; n++) re[n] = (senal[desde + n] ?? 0) * VENTANA[n];
  fft(re, im);
  const energias = [];
  for (let i = 0; i < TONOS; i++) {
    const k = BIN0 + SEP * i;
    let e = 0;
    for (let j = k - 1; j <= k + 1; j++) e += re[j] * re[j] + im[j] * im[j]; // tolera pequeños corrimientos
    energias.push(e);
  }
  let tono = 0;
  for (let i = 1; i < TONOS; i++) if (energias[i] > energias[tono]) tono = i;
  const ordenadas = [...energias].sort((a, b) => b - a);
  return { tono, energias, confianza: ordenadas[0] / (ordenadas[1] + 1e-12) };
}

/** Lee "cuantos" símbolos seguidos a partir de la muestra "inicioDatos". */
function leerSimbolos(senal, inicioDatos, desde, cuantos) {
  const res = [];
  for (let s = desde; s < desde + cuantos; s++) {
    res.push(detectarSimbolo(senal, inicioDatos + s * SIMBOLO + GUARDA));
  }
  return res;
}

/** Voto de mayoría entre tres copias (si las tres son distintas, gana la primera). */
const mayoria = (a, b, c) => (a === b || a === c ? a : b === c ? b : a);

/**
 * Decodifica un mensaje que empieza (el chirp) en la muestra "inicio".
 * @returns {{
 *   estado: 'ok'|'incompleto'|'dañado'|'largo-invalido',
 *   texto?: string, largo?: number, crcOk?: boolean, corregidos?: number,
 *   simbolos?: object[], muestrasNecesarias?: number
 * }}
 */
export function decodificar(senal, inicio) {
  const inicioDatos = inicio + CHIRP_LARGO + SILENCIO;

  // 1) Encabezado: largo del mensaje
  const finEncabezado = inicioDatos + SIMBOLOS_ENCABEZADO * SIMBOLO;
  if (senal.length < finEncabezado) return { estado: 'incompleto', muestrasNecesarias: finEncabezado };
  const enc = leerSimbolos(senal, inicioDatos, 0, SIMBOLOS_ENCABEZADO).map((s) => desdeGray(s.tono));
  const alto = mayoria(enc[0], enc[2], enc[4]);
  const bajo = mayoria(enc[1], enc[3], enc[5]);
  const largo = (alto << 4) | bajo;
  if (largo < 1 || largo > MAX_BYTES) return { estado: 'largo-invalido', largo };

  // 2) Cuerpo
  const nCuerpo = simbolosCuerpo(largo);
  const fin = finEncabezado + nCuerpo * SIMBOLO;
  if (senal.length < fin) return { estado: 'incompleto', largo, muestrasNecesarias: fin };
  const detectados = leerSimbolos(senal, inicioDatos, SIMBOLOS_ENCABEZADO, nCuerpo);
  const nibbles = detectados.map((s) => desdeGray(s.tono));

  // 3) Deshacer intercalado y Hamming
  const nBloques = 2 * (largo + 1);
  const bloques = desintercalar(nibblesABits(nibbles), nBloques);
  let corregidos = 0;
  const datos = bloques.map((b) => {
    const r = hammingDecodificar(b);
    if (r.corregido) corregidos++;
    return r.nibble;
  });
  const bytes = nibblesABytes(datos);
  const mensaje = bytes.slice(0, largo);
  const crcOk = crc8(mensaje) === bytes[largo];

  return {
    estado: crcOk ? 'ok' : 'dañado',
    texto: bytesATexto(mensaje),
    largo,
    crcOk,
    corregidos,
    simbolos: detectados,
    finMuestra: fin,
  };
}

/** Atajo: busca el chirp y decodifica (para señales completas ya grabadas). */
export function recibir(senal, opciones) {
  const chirp = buscarChirp(senal, opciones);
  if (!chirp) return { estado: 'sin-señal' };
  return { ...decodificar(senal, chirp.inicio), inicio: chirp.inicio, calidad: chirp.calidad };
}

/**
 * codigo.js — Cómo se convierten los mensajes en números protegidos contra errores
 * ===============================================================================
 *
 * Antes de convertir un mensaje en sonido hay que pasarlo a bits y protegerlo, porque
 * en el aire siempre se dañan algunos (ruido, eco, alguien hablando…). Aquí están las
 * herramientas para eso, en el orden en que se usan:
 *
 *   1) texto  → bytes          (UTF-8, para que funcionen las tildes y la ñ)
 *   2) CRC-8                   (un "dígito de verificación": sirve para saber si llegó bien)
 *   3) Hamming (7,4)           (agrega 3 bits de control a cada 4 bits: corrige 1 error)
 *   4) intercalado             (revuelve los bits para que un símbolo dañado no arruine
 *                               un solo bloque de Hamming, sino que reparta el daño)
 *   5) código Gray             (tonos vecinos difieren en un solo bit)
 */

// ───────────────────────────── 1) Texto ↔ bytes ─────────────────────────────

export function textoABytes(texto) {
  return Array.from(new TextEncoder().encode(texto));
}

export function bytesATexto(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}

// ─────────────────────────────── 2) CRC-8 ───────────────────────────────
// Se divide el mensaje (como si fuera un número binario gigante) entre el polinomio
// x^8 + x^2 + x + 1 (0x07) y se guarda el residuo. El receptor repite la cuenta:
// si su residuo no coincide, el mensaje llegó dañado.

export function crc8(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

// ──────────────────────────── 3) Hamming (7,4) ────────────────────────────
// Cada grupo de 4 bits de datos (d1 d2 d3 d4) se envía como 7 bits:
//     p1 p2 d1 p3 d2 d3 d4
// donde cada bit de paridad p revisa un grupo distinto de posiciones:
//     p1 = d1 ⊕ d2 ⊕ d4      p2 = d1 ⊕ d3 ⊕ d4      p3 = d2 ⊕ d3 ⊕ d4
// Al recibir, se recalculan las paridades; el "síndrome" (s3 s2 s1) dice en qué
// posición está el bit malo (0 = ninguno), y basta con voltearlo.

export function hammingCodificar(nibble) {
  const d1 = (nibble >> 3) & 1, d2 = (nibble >> 2) & 1, d3 = (nibble >> 1) & 1, d4 = nibble & 1;
  const p1 = d1 ^ d2 ^ d4;
  const p2 = d1 ^ d3 ^ d4;
  const p3 = d2 ^ d3 ^ d4;
  return [p1, p2, d1, p3, d2, d3, d4];
}

/** @returns {{ nibble: number, corregido: boolean }} */
export function hammingDecodificar(bits) {
  const b = bits.slice();
  const s1 = b[0] ^ b[2] ^ b[4] ^ b[6];
  const s2 = b[1] ^ b[2] ^ b[5] ^ b[6];
  const s3 = b[3] ^ b[4] ^ b[5] ^ b[6];
  const posicion = s1 + 2 * s2 + 4 * s3; // 1..7, o 0 si no hay error
  if (posicion) b[posicion - 1] ^= 1;
  return { nibble: (b[2] << 3) | (b[4] << 2) | (b[5] << 1) | b[6], corregido: posicion !== 0 };
}

// ─────────────────────────────── 4) Intercalado ───────────────────────────────
// Los bloques de 7 bits se escriben como filas de una tabla y se leen por columnas.
// Así, los 4 bits que viajan juntos en un mismo tono vienen de 4 bloques distintos:
// si ese tono se pierde, cada bloque recibe a lo sumo 1 error, y Hamming lo arregla.

export function intercalar(bloques) {
  const filas = bloques.length;
  const bits = [];
  for (let c = 0; c < 7; c++) for (let r = 0; r < filas; r++) bits.push(bloques[r][c]);
  return bits;
}

export function desintercalar(bits, filas) {
  const bloques = Array.from({ length: filas }, () => new Array(7).fill(0));
  for (let c = 0; c < 7; c++) for (let r = 0; r < filas; r++) bloques[r][c] = bits[c * filas + r] ?? 0;
  return bloques;
}

// ─────────────────────────────── 5) Código Gray ───────────────────────────────
// Si por eco o desajuste se confunde un tono con su vecino, con Gray solo falla 1 bit.

export const aGray = (n) => n ^ (n >> 1);
export function desdeGray(g) {
  let n = g;
  for (let s = g >> 1; s; s >>= 1) n ^= s;
  return n;
}

// ───────────────────────────── Utilidades de bits ─────────────────────────────

export function bytesANibbles(bytes) {
  const n = [];
  for (const b of bytes) n.push(b >> 4, b & 15);
  return n;
}

export function nibblesABytes(nibbles) {
  const b = [];
  for (let i = 0; i + 1 < nibbles.length; i += 2) b.push((nibbles[i] << 4) | nibbles[i + 1]);
  return b;
}

/** Agrupa bits de a 4 (rellena con ceros al final). */
export function bitsANibbles(bits) {
  const n = [];
  for (let i = 0; i < bits.length; i += 4) {
    n.push(((bits[i] ?? 0) << 3) | ((bits[i + 1] ?? 0) << 2) | ((bits[i + 2] ?? 0) << 1) | (bits[i + 3] ?? 0));
  }
  return n;
}

export function nibblesABits(nibbles) {
  const bits = [];
  for (const v of nibbles) bits.push((v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1);
  return bits;
}

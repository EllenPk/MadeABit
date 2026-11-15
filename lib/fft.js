/**
 * fft.js — Transformada Rápida de Fourier (FFT)
 * =============================================
 *
 * ¿Para qué sirve?
 *   Un sonido grabado es una lista de números (muestras) que dicen cómo se mueve la membrana
 *   del micrófono en el tiempo. La Transformada de Fourier responde otra pregunta:
 *   ¿qué FRECUENCIAS (notas) hay en ese sonido y con cuánta fuerza?
 *
 *   La fórmula de la DFT (Transformada Discreta de Fourier) es:
 *
 *       X[k] = Σ  x[n] · e^(−j·2π·k·n/N)      para n = 0 … N−1
 *
 *   Cada X[k] es un número complejo: su tamaño dice cuánta energía hay en la frecuencia
 *   f = k · (frecuencia de muestreo) / N.
 *
 * ¿Por qué "rápida"?
 *   Calcular la fórmula tal cual cuesta N² operaciones (para N = 1024, ¡un millón!).
 *   El algoritmo de Cooley–Tukey parte el problema en mitades una y otra vez y lo resuelve
 *   en N·log2(N) operaciones (≈ 10 000 para N = 1024). Sin esto, analizar una canción
 *   completa tardaría minutos en vez de milisegundos.
 *
 * Cómo se usa:
 *   const re = new Float64Array(1024);  // parte real   (aquí se ponen las muestras)
 *   const im = new Float64Array(1024);  // parte imaginaria (en ceros)
 *   fft(re, im);                        // ahora re/im contienen X[k]
 *
 *   ⚠ N tiene que ser potencia de 2 (256, 512, 1024, 2048…).
 *   ⚠ La función modifica los arreglos que recibe (no crea unos nuevos).
 */

export function fft(re, im) {
  const N = re.length;

  // ── Paso 1: reordenar las muestras ("inversión de bits") ─────────────────────
  // El algoritmo necesita las muestras en un orden especial: el índice escrito en binario
  // y al revés (por ejemplo, con N = 8, la posición 1 = 001 pasa a la 4 = 100).
  // Así, en el paso 2, las muestras pares e impares quedan juntas para combinarlas.
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // ── Paso 2: combinar DFTs pequeñas en DFTs más grandes ("mariposas") ─────────
  // Se empieza con DFTs de 2 puntos, luego de 4, de 8… hasta N.
  // En cada combinación se usan las mitades par (E) e impar (O):
  //
  //     X[k]       = E[k] + W·O[k]
  //     X[k + N/2] = E[k] − W·O[k]        con  W = e^(−j·2π·k/tamaño)
  //
  // Esa pareja de sumas y restas es la "mariposa" (por la forma que tiene su diagrama).
  for (let tam = 2; tam <= N; tam *= 2) {
    const mitad = tam / 2;
    const angulo = (-2 * Math.PI) / tam;
    for (let inicio = 0; inicio < N; inicio += tam) {
      for (let k = 0; k < mitad; k++) {
        // W = cos(ángulo·k) + j·sen(ángulo·k)
        const wRe = Math.cos(angulo * k);
        const wIm = Math.sin(angulo * k);
        const a = inicio + k; // posición de E[k]
        const b = a + mitad; // posición de O[k]

        // multiplicación de números complejos: t = W · O[k]
        const tRe = wRe * re[b] - wIm * im[b];
        const tIm = wRe * im[b] + wIm * re[b];

        // la mariposa
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] = re[a] + tRe;
        im[a] = im[a] + tIm;
      }
    }
  }
}

/**
 * DFT directa (la fórmula tal cual, lenta: N² operaciones).
 * No se usa en la página; sirve en los experimentos para comprobar que la FFT
 * da el mismo resultado y para medir cuánto más rápida es.
 *
 * @param {Float64Array} x  muestras de la señal
 * @returns {{re: Float64Array, im: Float64Array}}  parte real e imaginaria de X[k]
 */
export function dftDirecta(x) {
  const N = x.length;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    for (let n = 0; n < N; n++) {
      const angulo = (-2 * Math.PI * k * n) / N;
      re[k] += x[n] * Math.cos(angulo);
      im[k] += x[n] * Math.sin(angulo);
    }
  }
  return { re, im };
}

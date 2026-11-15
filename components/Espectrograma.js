'use client';

import { useEffect, useRef } from 'react';
import { fft } from '../lib/fft.js';
import { FS } from '../lib/modem.js';

/**
 * Espectrograma — dibuja "qué frecuencias suenan en cada momento" de una señal.
 *   eje horizontal: tiempo   ·   eje vertical: frecuencia (0 a 5 kHz)   ·   color: intensidad
 * Se calcula con la FFT en ventanas de 512 muestras (STFT), igual que en MadeWave.
 *
 * Props:
 *   senal    Float32Array a 24 000 Hz
 *   titulo   texto de arriba
 */
const VENTANA = 512;
const PASO = 256;
const F_MAX = 5000;

export default function Espectrograma({ senal, titulo }) {
  const lienzo = useRef(null);

  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas || !senal) return;
    const columnas = Math.max(1, Math.floor((senal.length - VENTANA) / PASO));
    const filas = Math.round((F_MAX / FS) * VENTANA); // bins hasta 5 kHz
    canvas.width = columnas;
    canvas.height = filas;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(columnas, filas);
    const hann = Float64Array.from({ length: VENTANA }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (VENTANA - 1))));

    const db = [];
    let max = -Infinity;
    for (let c = 0; c < columnas; c++) {
      const re = new Float64Array(VENTANA), im = new Float64Array(VENTANA);
      for (let n = 0; n < VENTANA; n++) re[n] = senal[c * PASO + n] * hann[n];
      fft(re, im);
      const col = new Float32Array(filas);
      for (let k = 0; k < filas; k++) {
        col[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-9);
        if (col[k] > max) max = col[k];
      }
      db.push(col);
    }
    // colores: de morado oscuro (silencio) a rosa y blanco (fuerte), rango de 60 dB
    for (let c = 0; c < columnas; c++) {
      for (let k = 0; k < filas; k++) {
        const v = Math.max(0, Math.min(1, (db[c][k] - (max - 60)) / 60));
        const i = ((filas - 1 - k) * columnas + c) * 4;
        img.data[i] = 20 + 235 * v;
        img.data[i + 1] = 12 + 90 * v * v + 140 * v ** 4;
        img.data[i + 2] = 40 + 120 * v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [senal]);

  return (
    <div className="espectrograma">
      <span className="etiqueta">{titulo}</span>
      <canvas ref={lienzo} />
      <div className="ejes">
        <span>0 s</span>
        <span>tiempo →</span>
        <span>{senal ? (senal.length / FS).toFixed(1) : 0} s</span>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { frecuenciaTono } from '../lib/modem.js';

/**
 * Cascada — espectro del micrófono en vivo, como una cascada que baja.
 * Cada fila nueva es lo que se escucha en ese instante (de 0 a 5 kHz). Las dos líneas
 * punteadas marcan la zona donde viven los 16 tonos del mensaje.
 *
 * Props:
 *   analizador   AnalyserNode del micrófono (o null si está apagado)
 */
const F_MAX = 5000;

export default function Cascada({ analizador }) {
  const lienzo = useRef(null);

  useEffect(() => {
    const canvas = lienzo.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#120f26';
    ctx.fillRect(0, 0, W, H);
    if (!analizador) return;

    const datos = new Uint8Array(analizador.frequencyBinCount);
    const hzPorBin = analizador.context.sampleRate / analizador.fftSize;
    const bins = Math.floor(F_MAX / hzPorBin);
    const x = (f) => (f / F_MAX) * W;
    let animacion;

    // La fila nueva se arma en una imagen de 1 píxel de alto y se pega de una vez
    // (antes se pintaba un rectángulo por cada frecuencia, unas 200 veces por cuadro).
    const fila = ctx.createImageData(W, 2);
    const zona = [x(frecuenciaTono(0) - 40), x(frecuenciaTono(15) + 40)].map(Math.round);
    let ultimo = 0;
    const dibujar = (ahora) => {
      animacion = requestAnimationFrame(dibujar);
      if (ahora - ultimo < 33) return; // máximo ~30 cuadros por segundo
      ultimo = ahora;
      analizador.getByteFrequencyData(datos);
      for (let px = 0; px < W; px++) {
        const v = datos[Math.floor((px / W) * bins)] / 255;
        const verde = px === zona[0] || px === zona[1];
        for (let y = 0; y < 2; y++) {
          const i = (y * W + px) * 4;
          fila.data[i] = verde ? 44 : 20 + 235 * v;
          fila.data[i + 1] = verde ? 182 : 12 + 90 * v * v + 140 * v ** 4;
          fila.data[i + 2] = verde ? 125 : 40 + 120 * v;
          fila.data[i + 3] = 255;
        }
      }
      ctx.drawImage(canvas, 0, 0, W, H - 2, 0, 2, W, H - 2); // baja todo 2 píxeles
      ctx.putImageData(fila, 0, 0);
    };
    animacion = requestAnimationFrame(dibujar);
    return () => cancelAnimationFrame(animacion);
  }, [analizador]);

  return (
    <div className="espectrograma">
      <span className="etiqueta">Lo que oye el micrófono (en vivo)</span>
      <canvas ref={lienzo} width={600} height={140} />
      <div className="ejes">
        <span>0 Hz</span>
        <span>frecuencia →</span>
        <span>5 kHz</span>
      </div>
    </div>
  );
}

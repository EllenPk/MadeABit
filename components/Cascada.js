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

    const dibujar = () => {
      analizador.getByteFrequencyData(datos);
      ctx.drawImage(canvas, 0, 0, W, H - 2, 0, 2, W, H - 2); // baja todo 2 píxeles
      for (let k = 0; k < bins; k++) {
        const v = datos[k] / 255;
        ctx.fillStyle = `rgb(${20 + 235 * v}, ${12 + 90 * v * v + 140 * v ** 4}, ${40 + 120 * v})`;
        ctx.fillRect((k / bins) * W, 0, W / bins + 1, 2);
      }
      // zona de los tonos
      ctx.fillStyle = 'rgba(44,182,125,0.9)';
      for (const f of [frecuenciaTono(0) - 40, frecuenciaTono(15) + 40]) ctx.fillRect(x(f), 0, 1, 2);
      animacion = requestAnimationFrame(dibujar);
    };
    dibujar();
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

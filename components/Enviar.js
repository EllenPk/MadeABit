'use client';

import { useState } from 'react';
import { FaPlay, FaDownload } from 'react-icons/fa6';
import { codificar, duracionMensaje, MAX_BYTES, frecuenciaTono } from '../lib/modem.js';
import { reproducir, aWav } from '../lib/audio.js';
import Espectrograma from './Espectrograma.js';

/**
 * Enviar — escribe un mensaje y lo convierte en sonido.
 *
 * Al tocar "Enviar por sonido" se arma la señal con modem.codificar() y suena por el
 * parlante. Mientras suena se ve una barra de avance y, abajo, el espectrograma del
 * sonido (cada rayita horizontal es un tono = 4 bits).
 */
export default function Enviar() {
  const [texto, setTexto] = useState('Hola, este mensaje viaja por el aire 🔊');
  const [avance, setAvance] = useState(null);
  const [senal, setSenal] = useState(null);

  const bytes = new TextEncoder().encode(texto).length;
  const muyLargo = bytes > MAX_BYTES;

  async function enviar() {
    const { senal } = codificar(texto);
    setSenal(senal);
    setAvance(0);
    await reproducir(senal, { alAvanzar: setAvance });
    setTimeout(() => setAvance(null), 600);
  }

  function descargar() {
    const s = senal ?? codificar(texto).senal;
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(aWav(s));
    enlace.download = 'mensaje-madeabit.wav';
    enlace.click();
  }

  return (
    <section className="tarjeta">
      <h3>1. Enviar</h3>
      <p className="suave">Escribe algo y ponlo a sonar. Otro computador o celular con MadeABit abierto lo puede recibir.</p>

      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={200} />
      <div className="fila">
        <span className={muyLargo ? 'contador mal' : 'contador'}>
          {bytes}/{MAX_BYTES} bytes · {duracionMensaje(Math.min(bytes, MAX_BYTES) || 1).toFixed(1)} s de sonido
        </span>
      </div>

      <div className="fila">
        <button className="boton" onClick={enviar} disabled={avance !== null || !texto || muyLargo}>
          <FaPlay /> {avance !== null ? 'Sonando…' : 'Enviar por sonido'}
        </button>
        <button className="boton secundario" onClick={descargar} disabled={!texto || muyLargo}>
          <FaDownload /> Descargar .wav
        </button>
      </div>

      {avance !== null && (
        <div className="progreso">
          <div style={{ width: `${avance * 100}%` }} />
        </div>
      )}

      {senal && <Espectrograma senal={senal} titulo="Así se ve tu mensaje" />}
      <p className="suave pequeno">
        Usa 16 tonos entre {frecuenciaTono(0)} Hz y {frecuenciaTono(15).toFixed(0)} Hz. Sube el volumen a un nivel cómodo.
      </p>
    </section>
  );
}

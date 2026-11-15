'use client';

import { useState } from 'react';
import { FaFlask, FaVolumeHigh } from 'react-icons/fa6';
import { codificar, recibir } from '../lib/modem.js';
import { pasarPorCanal } from '../lib/canal.js';
import { reproducir } from '../lib/audio.js';
import Espectrograma from './Espectrograma.js';
import Mensaje from './Mensaje.js';

/**
 * Simulador — prueba el sistema sin parlante ni micrófono.
 * El mensaje pasa por un "aire de mentira" (lib/canal.js) al que se le puede subir el
 * ruido y el eco, y luego se decodifica. Sirve para ver hasta dónde aguanta.
 */
const CUARTOS = [
  { nombre: 'Sin eco', rt60: 0, drrDb: 6 },
  { nombre: 'Cuarto, cerca', rt60: 0.4, drrDb: 6 },
  { nombre: 'Salón, lejos', rt60: 0.6, drrDb: 0 },
];

export default function Simulador() {
  const [texto, setTexto] = useState('Prueba con ruido');
  const [snr, setSnr] = useState(0);
  const [cuarto, setCuarto] = useState(1);
  const [salida, setSalida] = useState(null);

  function probar() {
    const { senal } = codificar(texto || ' ');
    const { rt60, drrDb } = CUARTOS[cuarto];
    const recibido = pasarPorCanal(senal, { snrDb: snr, rt60, drrDb, retraso: 6000 });
    // se baja el volumen para que no sature al reproducirlo
    let pico = 0;
    for (const v of recibido) pico = Math.max(pico, Math.abs(v));
    const escuchar = recibido.map((v) => (0.8 * v) / pico);
    setSalida({ senal: escuchar, resultado: { ...recibir(recibido), origen: 'simulación', hora: new Date() } });
  }

  return (
    <section className="tarjeta">
      <h3>3. Prueba sin micrófono</h3>
      <p className="suave">Ponle ruido y eco al mensaje y mira si todavía se entiende.</p>

      <input className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={60} />

      <label className="deslizador">
        <span>
          Ruido: SNR <b>{snr} dB</b> {snr <= -14 ? '(muchísimo ruido)' : snr <= 0 ? '(bastante ruido)' : '(poco ruido)'}
        </span>
        <input type="range" min={-24} max={30} value={snr} onChange={(e) => setSnr(+e.target.value)} />
      </label>

      <div className="opciones">
        {CUARTOS.map((c, i) => (
          <button key={c.nombre} className={i === cuarto ? 'chip activo' : 'chip'} onClick={() => setCuarto(i)}>
            {c.nombre}
          </button>
        ))}
      </div>

      <div className="fila">
        <button className="boton" onClick={probar}>
          <FaFlask /> Probar
        </button>
        {salida && (
          <button className="boton secundario" onClick={() => reproducir(salida.senal)}>
            <FaVolumeHigh /> Escuchar cómo llega
          </button>
        )}
      </div>

      {salida && (
        <>
          {salida.resultado.estado === 'sin-señal' ? (
            <p className="estado">No se encontró el inicio del mensaje: el ruido lo tapó por completo.</p>
          ) : (
            <Mensaje resultado={salida.resultado} />
          )}
          <Espectrograma senal={salida.senal} titulo="Lo que le llega al receptor" />
        </>
      )}
    </section>
  );
}

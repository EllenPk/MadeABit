'use client';

import { useEffect, useRef, useState } from 'react';
import { FaMicrophone, FaStop, FaFileAudio, FaDownload } from 'react-icons/fa6';
import { Receptor } from '../lib/receptor.js';
import { abrirMicrofono, leerArchivo, aWav, listarMicrofonos } from '../lib/audio.js';
import { recibir as recibirSenal, FS } from '../lib/modem.js';
import Cascada from './Cascada.js';
import Mensaje from './Mensaje.js';

/**
 * Recibir — escucha el micrófono y muestra los mensajes que van llegando.
 *
 * Cada bloque del micrófono pasa al Receptor (lib/receptor.js), que busca el chirp de
 * inicio y luego decodifica. Mientras tanto se dibuja la "cascada" (espectro en vivo)
 * para ver los tonos llegar. También se puede abrir un .wav grabado.
 *
 * Para encontrar fallas hay dos medidores y un botón:
 *   - Volumen: qué tan fuerte llega el sonido al micrófono.
 *   - Inicio: qué tanto se parece lo escuchado al "fiuuu" de inicio (debe pasar la raya).
 *   - "Descargar lo que escuché": guarda los últimos 30 s del micrófono en un .wav.
 *
 * Si el micrófono entrega silencio total (pasa en algunos portátiles cuando se pide el
 * sonido "sin filtros"), a los 2 segundos se vuelve a abrir solo en modo normal.
 * También se puede escoger qué micrófono usar.
 */
const GUARDAR_SEGUNDOS = 30;
export default function Recibir() {
  const [escuchando, setEscuchando] = useState(false);
  const [estado, setEstado] = useState('Toca «Escuchar» y acerca el otro dispositivo.');
  const [avance, setAvance] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [analizador, setAnalizador] = useState(null);
  const [medidor, setMedidor] = useState({ volumen: 0, calidad: 0, rho: 0 });
  const microfono = useRef(null);
  const grabacion = useRef([]); // bloques recientes del micrófono (para descargar)
  const [microfonos, setMicrofonos] = useState([]);
  const [elegido, setElegido] = useState('');

  // guarda un resultado al inicio de la lista
  const anotar = (r, origen) => setMensajes((m) => [{ ...r, origen, hora: new Date() }, ...m].slice(0, 8));

  async function empezar(dispositivo = elegido, crudo = true) {
    try {
      grabacion.current = [];
      const receptor = new Receptor({
        alBuscar: ({ calidad, rho }) => setMedidor((m) => ({ ...m, calidad, rho })),
        alDetectar: (r) => {
          setEstado(`¡Se oyó el inicio de un mensaje! (calidad ${r.calidad.toFixed(0)})`);
          setAvance(0);
        },
        alProgresar: ({ largo, avance }) => {
          setEstado(`Recibiendo un mensaje de ${largo} bytes…`);
          setAvance(avance);
        },
        alTerminar: (r) => {
          setAvance(null);
          setEstado('Escuchando… (esperando el siguiente mensaje)');
          anotar(r, 'micrófono');
        },
      });
      let pendiente = 0;
      let picoMaximo = 0;
      let muestras = 0;
      const mic = await abrirMicrofono(
        (bloque, pico) => {
          // se guardan los últimos 30 s por si hay que revisar qué se escuchó
          grabacion.current.push(bloque);
          pendiente += bloque.length;
          while (pendiente > GUARDAR_SEGUNDOS * FS) pendiente -= grabacion.current.shift().length;
          setMedidor((m) => ({ ...m, volumen: Math.max(pico, m.volumen * 0.85) }));
          receptor.agregar(bloque);

          // ¿el micrófono entrega silencio total? → se reabre en modo normal
          picoMaximo = Math.max(picoMaximo, pico);
          muestras += bloque.length;
          if (crudo && muestras > 2 * FS && picoMaximo === 0 && microfono.current === mic) {
            mic.detener();
            setEstado('Tu micrófono no entrega sonido sin filtros; probando en modo normal…');
            empezar(dispositivo, false);
          }
        },
        { dispositivo, crudo },
      );
      microfono.current = mic;
      setAnalizador(mic.analizador);
      setEscuchando(true);
      setEstado(`Escuchando${crudo ? '' : ' (modo normal)'} con «${mic.nombre || 'micrófono'}»… pon a sonar un mensaje cerca.`);
      setMicrofonos(await listarMicrofonos());
    } catch (e) {
      setEstado(
        e?.name === 'NotAllowedError'
          ? 'El navegador no dio permiso para el micrófono. Toca el candado de la barra de direcciones y permítelo.'
          : 'No se pudo abrir el micrófono. Revisa que esté conectado y que la página esté en https o localhost.',
      );
    }
  }

  function cambiarMicrofono(id) {
    setElegido(id);
    if (microfono.current) {
      microfono.current.detener();
      microfono.current = null;
      empezar(id, true);
    }
  }

  function parar() {
    microfono.current?.detener();
    microfono.current = null;
    setAnalizador(null);
    setEscuchando(false);
    setAvance(null);
    setEstado('Micrófono apagado.');
  }

  function descargarGrabacion() {
    const total = grabacion.current.reduce((n, b) => n + b.length, 0);
    const todo = new Float32Array(total);
    let pos = 0;
    for (const b of grabacion.current) {
      todo.set(b, pos);
      pos += b.length;
    }
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(aWav(todo));
    enlace.download = 'lo-que-escucho-madeabit.wav';
    enlace.click();
  }

  async function abrirArchivo(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setEstado(`Leyendo ${archivo.name}…`);
    try {
      const senal = await leerArchivo(archivo);
      const r = recibirSenal(senal);
      if (r.estado === 'sin-señal') setEstado('En ese archivo no se encontró ningún mensaje.');
      else {
        setEstado('Archivo revisado.');
        anotar(r, archivo.name);
      }
    } catch {
      setEstado('No se pudo leer ese archivo de audio.');
    }
    e.target.value = '';
  }

  useEffect(() => () => microfono.current?.detener(), []); // apaga el micrófono al salir

  return (
    <section className="tarjeta">
      <h3>2. Recibir</h3>
      <p className="suave">Usa el micrófono de este dispositivo para atrapar los mensajes que suenan cerca.</p>

      <div className="fila">
        {escuchando ? (
          <button className="boton rojo" onClick={parar}>
            <FaStop /> Dejar de escuchar
          </button>
        ) : (
          <button className="boton" onClick={() => empezar()}>
            <FaMicrophone /> Escuchar
          </button>
        )}
        {escuchando && (
          <button className="boton secundario" onClick={descargarGrabacion}>
            <FaDownload /> Descargar lo que escuché
          </button>
        )}
        <label className="boton secundario">
          <FaFileAudio /> Abrir un .wav
          <input type="file" accept="audio/*" onChange={abrirArchivo} />
        </label>
      </div>

      {microfonos.length > 1 && (
        <label className="selector">
          Micrófono:
          <select value={elegido} onChange={(e) => cambiarMicrofono(e.target.value)}>
            <option value="">Predeterminado</option>
            {microfonos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="estado">{estado}</p>

      {escuchando && (
        <div className="medidores">
          <Medidor
            nombre="Volumen"
            valor={medidor.volumen}
            raya={0.05}
            ayuda={medidor.volumen < 0.05 ? 'muy bajo: sube el volumen o acércalo' : medidor.volumen > 0.95 ? 'saturado: baja el volumen' : 'bien'}
          />
          <Medidor
            nombre="Inicio"
            valor={Math.min(1, medidor.rho / 0.3)}
            raya={0.5}
            ayuda={medidor.rho >= 0.15 && medidor.calidad >= 10 ? '¡se reconoce!' : 'aún no se reconoce el inicio'}
          />
        </div>
      )}
      {avance !== null && (
        <div className="progreso">
          <div style={{ width: `${Math.min(1, avance) * 100}%` }} />
        </div>
      )}

      <Cascada analizador={analizador} />

      {mensajes.length > 0 && (
        <div className="mensajes">
          {mensajes.map((m, i) => (
            <Mensaje key={m.hora.getTime() + '-' + i} resultado={m} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Barrita de nivel con una raya que marca el mínimo necesario. */
function Medidor({ nombre, valor, raya, ayuda }) {
  return (
    <div className="medidor">
      <span>{nombre}</span>
      <div className="barra-medidor">
        <div style={{ width: `${Math.min(1, valor) * 100}%` }} />
        <i style={{ left: `${raya * 100}%` }} />
      </div>
      <small>{ayuda}</small>
    </div>
  );
}

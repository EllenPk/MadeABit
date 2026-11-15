/**
 * audio.js — Parlante y micrófono en el navegador
 * ===============================================
 *
 * El módem trabaja con señales a 24 000 muestras por segundo (FS). Aquí está lo práctico:
 *   - reproducir():       saca una señal por el parlante.
 *   - abrirMicrofono():   escucha el micrófono sin parar y entrega bloques ya a 24 000 Hz.
 *   - leerArchivo():      abre un .wav / .mp3 grabado y lo pasa a 24 000 Hz.
 *   - aWav():             convierte una señal en un archivo .wav para descargar.
 *
 * Usa la Web Audio API, así que solo funciona en el navegador (no en Node).
 */

import { FS } from './modem.js';

let contexto = null;
/** Un solo AudioContext para toda la página (el navegador permite pocos). */
export function audioContext() {
  if (!contexto) contexto = new AudioContext();
  return contexto;
}

/**
 * Reproduce una señal (a 24 000 Hz). El navegador la convierte solo a la frecuencia
 * de su tarjeta de sonido (normalmente 48 000 Hz).
 * @returns {Promise<void>} se cumple cuando termina de sonar
 */
export async function reproducir(senal, { alAvanzar } = {}) {
  const ctx = audioContext();
  await ctx.resume();
  const buffer = ctx.createBuffer(1, senal.length, FS);
  buffer.copyToChannel(senal, 0);
  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  fuente.connect(ctx.destination);
  const inicio = ctx.currentTime + 0.05;
  fuente.start(inicio);

  // avisa el avance (de 0 a 1) para dibujar la barra de progreso
  let timer = null;
  if (alAvanzar) {
    timer = setInterval(() => alAvanzar(Math.min(1, Math.max(0, (ctx.currentTime - inicio) / buffer.duration))), 50);
  }
  await new Promise((listo) => (fuente.onended = listo));
  if (timer) clearInterval(timer);
  alAvanzar?.(1);
}

/**
 * Cambia la frecuencia de muestreo con interpolación lineal y un promedio simple antes
 * (para que no aparezcan frecuencias falsas al bajar de 48 000 a 24 000 Hz).
 * Guarda "estado" entre bloques para que no haya saltos en los bordes.
 */
function crearConversor(fsEntrada) {
  const paso = fsEntrada / FS; // cuántas muestras de entrada por cada muestra de salida
  let pos = 0; // posición (con decimales) de la próxima muestra de salida, contando desde "previa"
  let crudaAnterior = 0; // última muestra del bloque anterior (para el filtro)
  let previa = 0; // última muestra filtrada del bloque anterior (para interpolar en el borde)
  return (bloque) => {
    // ext = [última muestra del bloque anterior, ...bloque filtrado]
    const ext = new Float32Array(bloque.length + 1);
    ext[0] = previa;
    for (let i = 0; i < bloque.length; i++) {
      // filtro pasa-bajos muy simple: promedio de 2 muestras (suficiente para 1–4 kHz)
      ext[i + 1] = paso > 1.5 ? 0.5 * (bloque[i] + (i ? bloque[i - 1] : crudaAnterior)) : bloque[i];
    }
    crudaAnterior = bloque[bloque.length - 1];
    previa = ext[ext.length - 1];
    const salida = [];
    while (pos < ext.length - 1) {
      const i = Math.floor(pos);
      const f = pos - i;
      salida.push(ext[i] * (1 - f) + ext[i + 1] * f);
      pos += paso;
    }
    pos -= bloque.length; // el siguiente bloque empieza una posición más adelante
    return Float32Array.from(salida);
  };
}

/**
 * Abre el micrófono y llama a alRecibir(bloque, pico) cada ~85 ms con muestras nuevas a 24 000 Hz
 * (pico = volumen máximo del bloque, de 0 a 1).
 * Se apagan los filtros del navegador (cancelación de eco, supresión de ruido, volumen
 * automático): están hechos para la voz y deforman los tonos.
 *
 * @param {object} opciones
 *   dispositivo   id del micrófono a usar ('' = el predeterminado)
 *   crudo         true = sin filtros del navegador; false = modo normal (con filtros)
 * @returns {Promise<{ detener: () => void, analizador: AnalyserNode, fsReal: number, nombre: string }>}
 */
export async function abrirMicrofono(alRecibir, { dispositivo = '', crudo = true } = {}) {
  const ctx = audioContext();
  await ctx.resume();
  // "crudo" pide el sonido sin filtros. Algunos portátiles (por ejemplo con micrófonos con
  // IA de Acer o Realtek) entregan SILENCIO en ese modo; por eso se puede pedir el modo normal.
  const audio = crudo ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : {};
  if (dispositivo) audio.deviceId = { exact: dispositivo };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: Object.keys(audio).length ? audio : true });
  const entrada = ctx.createMediaStreamSource(stream);
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 2048;
  analizador.smoothingTimeConstant = 0;
  entrada.connect(analizador);

  const convertir = crearConversor(ctx.sampleRate);
  const procesador = ctx.createScriptProcessor(4096, 1, 1);
  const mudo = ctx.createGain();
  mudo.gain.value = 0; // el procesador debe ir a la salida para funcionar, pero sin sonar
  procesador.onaudioprocess = (e) => {
    const entradaCruda = e.inputBuffer.getChannelData(0);
    let pico = 0;
    for (let i = 0; i < entradaCruda.length; i++) pico = Math.max(pico, Math.abs(entradaCruda[i]));
    alRecibir(convertir(entradaCruda), pico);
  };
  entrada.connect(procesador);
  procesador.connect(mudo);
  mudo.connect(ctx.destination);

  return {
    analizador,
    fsReal: ctx.sampleRate,
    nombre: stream.getAudioTracks()[0]?.label ?? '',
    detener() {
      procesador.disconnect();
      entrada.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/** Abre un archivo de audio (wav, mp3…) y lo entrega mono a 24 000 Hz. */
export async function leerArchivo(archivo) {
  const datos = await archivo.arrayBuffer();
  const audio = await audioContext().decodeAudioData(datos);
  const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * FS), FS);
  const fuente = offline.createBufferSource();
  fuente.buffer = audio;
  fuente.connect(offline.destination);
  fuente.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** Convierte la señal en un archivo WAV (16 bits, mono) para descargar o compartir. */
export function aWav(senal) {
  const bytes = new ArrayBuffer(44 + senal.length * 2);
  const v = new DataView(bytes);
  const texto = (pos, t) => [...t].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + senal.length * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, FS, true);
  v.setUint32(28, FS * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, senal.length * 2, true);
  for (let i = 0; i < senal.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, senal[i])) * 32767, true);
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Lista los micrófonos del equipo (los nombres solo aparecen después de dar el permiso). */
export async function listarMicrofonos() {
  const todos = await navigator.mediaDevices.enumerateDevices();
  return todos.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, nombre: d.label || `Micrófono ${i + 1}` }));
}

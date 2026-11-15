/**
 * receptor.js — Escucha sin parar y avisa cuando llega un mensaje
 * ===============================================================
 *
 * El micrófono entrega pedacitos de sonido todo el tiempo. Este "receptor" los va
 * juntando y hace dos cosas, según el estado:
 *
 *   BUSCANDO   → cada poco revisa si en lo último que escuchó hay un chirp ("fiuuu").
 *   RECIBIENDO → ya sabe dónde empieza el mensaje; espera a que llegue completo
 *                y lo decodifica. Luego vuelve a BUSCANDO.
 *
 * Se puede usar igual en el navegador (con el micrófono) o en Node (con un archivo),
 * lo que permite probarlo sin parlantes.
 */

import { FS, CHIRP_LARGO, buscarChirp, decodificar } from './modem.js';

const MAX_BUSQUEDA = Math.round(2.5 * FS); // solo se busca en los últimos 2,5 s
const CADA = Math.round(0.25 * FS); // se busca cada 0,25 s de audio nuevo
const UMBRAL_CALIDAD = 10; // mismos umbrales que modem.buscarChirp
const UMBRAL_RHO = 0.15;

export class Receptor {
  /**
   * @param {object} avisos
   *   alBuscar({ calidad, rho })             → cada revisión (aunque no haya chirp), para mostrar el nivel
   *   alDetectar({ calidad })                → se oyó un chirp, empieza un mensaje
   *   alProgresar({ largo, avance })         → cuánto del mensaje ha llegado (0 a 1)
   *   alTerminar(resultado)                  → resultado de modem.decodificar
   */
  constructor(avisos = {}) {
    this.avisos = avisos;
    this.buffer = new Float32Array(0);
    this.estado = 'buscando';
    this.inicio = 0;
    this.sinRevisar = 0;
  }

  /** Agrega muestras nuevas (a 24 000 Hz). */
  agregar(bloque) {
    const nuevo = new Float32Array(this.buffer.length + bloque.length);
    nuevo.set(this.buffer);
    nuevo.set(bloque, this.buffer.length);
    this.buffer = nuevo;
    this.sinRevisar += bloque.length;

    if (this.estado === 'buscando') {
      // no guardar más de lo necesario mientras se busca
      if (this.buffer.length > MAX_BUSQUEDA) {
        this.buffer = this.buffer.slice(this.buffer.length - MAX_BUSQUEDA);
      }
      if (this.sinRevisar >= CADA) {
        this.sinRevisar = 0;
        // se busca sin umbral para poder mostrar qué tan cerca estuvo (sirve para diagnosticar)
        const r = buscarChirp(this.buffer, { minCalidad: 0, minRho: 0 });
        if (r) this.avisos.alBuscar?.(r);
        const pasa = r && r.calidad >= UMBRAL_CALIDAD && r.rho >= UMBRAL_RHO;
        // solo se acepta si el chirp ya llegó completo (no está cortado al final)
        if (pasa && r.inicio + CHIRP_LARGO + Math.round(0.1 * FS) < this.buffer.length) {
          this.buffer = this.buffer.slice(r.inicio);
          this.inicio = 0;
          this.estado = 'recibiendo';
          this.avisos.alDetectar?.(r);
        }
      }
    }

    if (this.estado === 'recibiendo') this.intentarDecodificar();
  }

  intentarDecodificar() {
    const r = decodificar(this.buffer, this.inicio);
    if (r.estado === 'incompleto') {
      if (r.largo) this.avisos.alProgresar?.({ largo: r.largo, avance: this.buffer.length / r.muestrasNecesarias });
      return;
    }
    this.avisos.alTerminar?.(r);
    // se descarta lo ya usado y se vuelve a buscar el siguiente mensaje
    const fin = r.finMuestra ?? CHIRP_LARGO;
    this.buffer = this.buffer.slice(fin);
    this.estado = 'buscando';
    this.sinRevisar = 0;
  }

  reiniciar() {
    this.buffer = new Float32Array(0);
    this.estado = 'buscando';
  }
}

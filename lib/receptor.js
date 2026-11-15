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

// Se busca el chirp cada 0,5 s, solo en el último segundo escuchado. Así cualquier chirp
// (que dura 0,25 s) cae completo en al menos una búsqueda, y la FFT es de 32 768 puntos
// en vez de 131 072 (unas 8 veces menos trabajo que buscar en 2,5 s cada 0,25 s).
const MAX_BUSQUEDA = Math.round(1.0 * FS);
const CADA = Math.round(0.5 * FS);
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
    this.memoria = new Float32Array(4 * FS); // espacio reservado (crece si hace falta)
    this.largo = 0; // cuántas muestras útiles hay en memoria
    this.buffer = this.memoria.subarray(0, 0); // vista de las muestras útiles
    this.estado = 'buscando';
    this.inicio = 0;
    this.sinRevisar = 0;
  }

  /** Descarta las primeras "n" muestras (corre el resto al inicio). */
  descartar(n) {
    n = Math.min(n, this.largo);
    this.memoria.copyWithin(0, n, this.largo);
    this.largo -= n;
    this.buffer = this.memoria.subarray(0, this.largo);
  }

  /** Agrega muestras nuevas (a 24 000 Hz). */
  agregar(bloque) {
    // Se guarda en un arreglo con espacio de sobra que crece al doble cuando se llena,
    // en vez de copiar todo lo escuchado cada vez que llegan 85 ms nuevos.
    if (this.largo + bloque.length > this.memoria.length) {
      const nueva = new Float32Array(Math.max(2 * this.memoria.length, this.largo + bloque.length));
      nueva.set(this.memoria.subarray(0, this.largo));
      this.memoria = nueva;
    }
    this.memoria.set(bloque, this.largo);
    this.largo += bloque.length;
    this.buffer = this.memoria.subarray(0, this.largo);
    this.sinRevisar += bloque.length;

    if (this.estado === 'buscando') {
      // no guardar más de lo necesario mientras se busca
      if (this.buffer.length > MAX_BUSQUEDA) {
        this.descartar(this.largo - MAX_BUSQUEDA);
      }
      if (this.sinRevisar >= CADA) {
        this.sinRevisar = 0;
        // se busca sin umbral para poder mostrar qué tan cerca estuvo (sirve para diagnosticar)
        const r = buscarChirp(this.buffer, { minCalidad: 0, minRho: 0 });
        if (r) this.avisos.alBuscar?.(r);
        const pasa = r && r.calidad >= UMBRAL_CALIDAD && r.rho >= UMBRAL_RHO;
        // solo se acepta si el chirp ya llegó completo (no está cortado al final)
        if (pasa && r.inicio + CHIRP_LARGO + Math.round(0.1 * FS) < this.buffer.length) {
          this.descartar(r.inicio);
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
    this.descartar(fin);
    this.estado = 'buscando';
    this.sinRevisar = 0;
  }

  reiniciar() {
    this.descartar(this.largo);
    this.estado = 'buscando';
  }
}

// datos_figuras.mjs — guarda señales de ejemplo para dibujar las figuras del artículo.
import { writeFileSync } from 'node:fs';
import { codificar, buscarChirp, detectarSimbolo, FS, CHIRP_LARGO, SIMBOLO, GUARDA } from '../lib/modem.js';
import { pasarPorCanal, azarConSemilla } from '../lib/canal.js';
const azar = azarConSemilla(11);
const texto = 'Hola CUC';
const { senal, simbolos } = codificar(texto);
const ruidosa = pasarPorCanal(senal, { snrDb: 0, rt60: 0.3, drrDb: 6, retraso: 6000, azar });
const r = buscarChirp(ruidosa);
const inicioDatos = r.inicio + CHIRP_LARGO + Math.round(0.05 * FS);
const sim = detectarSimbolo(ruidosa, inicioDatos + 8 * SIMBOLO + GUARDA);
writeFileSync('/home/claude/paper2/datos.json', JSON.stringify({
  fs: FS, senal: Array.from(senal), ruidosa: Array.from(ruidosa), simbolos, inicio: r.inicio, calidad: r.calidad, rho: r.rho,
  energias: sim.energias, tonoDetectado: sim.tono, tonoEnviado: simbolos[8],
}));
console.log(r, simbolos.length, sim.tono, simbolos[8]);

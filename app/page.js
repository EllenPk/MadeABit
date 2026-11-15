// app/page.js — La página principal. Solo junta las piezas (están en /components).

import Encabezado from '../components/Encabezado.js';
import ComoFunciona from '../components/ComoFunciona.js';
import Enviar from '../components/Enviar.js';
import Recibir from '../components/Recibir.js';
import Simulador from '../components/Simulador.js';
import PiePagina from '../components/PiePagina.js';

export default function Pagina() {
  return (
    <main>
      <Encabezado />
      <ComoFunciona />
      <div className="dos-columnas">
        <Enviar />
        <Recibir />
      </div>
      <Simulador />
      <PiePagina />
    </main>
  );
}

import { FaKeyboard, FaWaveSquare, FaMicrophoneLines, FaComment } from 'react-icons/fa6';

/**
 * ComoFunciona — los 4 pasos del sistema explicados en una línea cada uno.
 */
const PASOS = [
  { icono: <FaKeyboard />, titulo: 'Texto a bits', texto: 'El mensaje se pasa a bytes y se le agrega protección contra errores.' },
  { icono: <FaWaveSquare />, titulo: 'Bits a tonos', texto: 'Cada 4 bits se vuelven uno de 16 tonos (53 ms cada uno).' },
  { icono: <FaMicrophoneLines />, titulo: 'Escuchar', texto: 'El micrófono busca el “fiuuu” de inicio y mide cada tono con la FFT.' },
  { icono: <FaComment />, titulo: 'Tonos a texto', texto: 'Se corrigen los errores y el CRC confirma que llegó bien.' },
];

export default function ComoFunciona() {
  return (
    <section className="pasos">
      {PASOS.map((p, i) => (
        <div className="paso" key={p.titulo}>
          <div className="paso-icono">{p.icono}</div>
          <b>
            {i + 1}. {p.titulo}
          </b>
          <span>{p.texto}</span>
        </div>
      ))}
    </section>
  );
}

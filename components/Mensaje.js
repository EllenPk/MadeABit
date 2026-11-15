import { FaCircleCheck, FaTriangleExclamation } from 'react-icons/fa6';

/**
 * Mensaje — tarjetita con un mensaje recibido.
 * Verde si el CRC dice que llegó bien; amarillo si llegó dañado (se muestra igual lo que se pudo leer).
 *
 * Props:
 *   resultado   lo que devuelve modem.decodificar(), más { origen, hora }
 */
export default function Mensaje({ resultado: r }) {
  const bien = r.estado === 'ok';
  const hora = r.hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let detalle;
  if (r.estado === 'largo-invalido') detalle = 'Se oyó un inicio, pero el encabezado llegó dañado.';
  else if (bien) detalle = `${r.largo} bytes · ${r.corregidos} bloques corregidos por Hamming`;
  else detalle = `El CRC no coincide: llegó con errores (${r.corregidos} bloques corregidos, no alcanzó)`;

  return (
    <div className={bien ? 'mensaje-recibido bien' : 'mensaje-recibido mal'}>
      <div className="icono">{bien ? <FaCircleCheck /> : <FaTriangleExclamation />}</div>
      <div>
        {r.texto && <p className="texto">{r.texto}</p>}
        <p className="suave pequeno">
          {detalle} · {r.origen} · {hora}
        </p>
      </div>
    </div>
  );
}

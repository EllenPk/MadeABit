import Logo from './Logo.js';
import { FaInstagram, FaFacebook, FaXTwitter } from 'react-icons/fa6';

/**
 * PiePagina — marca MadeABit, eslogan, íconos de redes y derechos de TeamRooster.
 * Los íconos son solo decorativos. Para que lleven a una red social, cambia cada <span>
 * por un enlace, por ejemplo: <a href="https://instagram.com/tu_usuario" target="_blank"><FaInstagram /></a>
 * Los íconos vienen de la librería react-icons (https://react-icons.github.io/react-icons/).
 */
export default function PiePagina() {
  return (
    <footer className="pie">
      <div className="pie-marca">
        <div className="logo pequeno">
          <Logo tamano={40} />
        </div>
        <h2>
          Made<b>ABit</b>
        </h2>
      </div>
      <p className="eslogan">Tu mensaje viaja en cada sonido</p>

      {/* íconos de redes sociales (solo decorativos, no llevan a ninguna página) */}
      <div className="redes" aria-hidden="true">
        <span>
          <FaInstagram />
        </span>
        <span>
          <FaFacebook />
        </span>
        <span>
          <FaXTwitter />
        </span>
      </div>

      <p className="derechos">© {new Date().getFullYear()} TeamRooster — Todos los derechos reservados.</p>
    </footer>
  );
}

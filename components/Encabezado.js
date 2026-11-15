import Logo from './Logo.js';

/**
 * Encabezado — logo, nombre "MadeABit" y subtítulo.
 * Para cambiar el nombre, edita el texto de aquí (y el título de la pestaña en app/layout.js).
 */
export default function Encabezado() {
  return (
    <header className="encabezado">
      <div className="logo">
        <Logo tamano={56} />
      </div>
      <div>
        <h1>
          Made<b>ABit</b>
        </h1>
        <p>Si se escucha, llega.</p>
      </div>
    </header>
  );
}

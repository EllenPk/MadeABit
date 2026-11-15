/**
 * Logo — chica con audífonos (logo de MadeABit), con los colores morado y rosa de la página.
 * La imagen está en public/logo.png (círculo con fondo transparente).
 * Para cambiar el logo basta con reemplazar ese archivo por otro del mismo nombre.
 *
 * Props:
 *   tamano   ancho y alto en píxeles (por defecto 120)
 */
export default function Logo({ tamano = 120 }) {
  return <img src="/logo.png" width={tamano} height={tamano} alt="Logo MadeABit" className="logo-img" />;
}

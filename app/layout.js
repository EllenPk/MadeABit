// app/layout.js — Estructura HTML común (Next.js la pone alrededor de page.js).
// Aquí van el título de la pestaña, la descripción y los estilos.

import './globals.css';

export const metadata = {
  title: 'MadeABit',
  description: 'Si se escucha, llega.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

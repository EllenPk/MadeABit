# MadeABit — mensajes que viajan por el aire

Página web que envía y recibe texto usando **sonido audible**: un computador lo hace sonar por el
parlante y otro (o un celular) lo escucha con el micrófono. Sin WiFi, Bluetooth ni cables.
Proyecto de Alan Monterroza (CUC) · TeamRooster.

## Cómo correrla

```bash
npm install
npm run dev        # abre http://localhost:3000
```

> El micrófono solo funciona en `localhost` o con `https` (Netlify ya da https).
> Usa Chrome o Edge y sube el volumen a un nivel cómodo.

Para probar: abre la página en dos dispositivos, en uno toca **Escuchar** y en el otro escribe un
mensaje y toca **Enviar por sonido**. Funciona mejor si están cerca (menos de 1 m).

## Cómo funciona (resumen)

1. El texto se pasa a bytes (UTF-8) y se le agrega un **CRC-8** para saber si llegó bien.
2. Cada 4 bits se protegen con **Hamming (7,4)**, se **intercalan** y se pasan a **código Gray**.
3. Cada grupo de 4 bits se vuelve uno de **16 tonos** entre 1500 y 2906 Hz (53 ms cada uno).
4. Antes de los datos suena un **chirp** de 1 a 4 kHz para que el receptor sepa dónde empieza.
5. El receptor encuentra el chirp con una **correlación** (hecha con la FFT), mide cada tono con la
   **FFT** y deshace todo lo anterior.

Velocidad: 75 bit/s en bruto, unos 40 bit/s de texto útil.

## Organización

```
app/            página principal (page.js), título (layout.js) y estilos (globals.css)
components/     piezas de la página
  Encabezado, ComoFunciona, Enviar, Recibir, Simulador, Espectrograma, Cascada, Mensaje, PiePagina, Logo
lib/            la lógica (se puede usar también en Node, sin navegador)
  fft.js        Transformada Rápida de Fourier
  codigo.js     CRC-8, Hamming, intercalado, Gray
  modem.js      tonos, chirp, sincronización, codificar/decodificar
  receptor.js   escucha continua (busca el chirp y decodifica)
  canal.js      "aire de mentira" con ruido y eco para las pruebas
  audio.js      parlante, micrófono y archivos .wav (solo navegador)
scripts/        experimentos del artículo (npm run experimentos)
```

## Subir a Netlify

Sube la carpeta a GitHub y en Netlify elige *Import from Git*. Netlify detecta Next.js solo
(comando `npm run build`). No necesita variables de entorno.

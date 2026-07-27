# Armario — outfits diarios

PWA sin dependencias externas (HTML + CSS + JavaScript vanilla, sin build) para
guardar tus prendas y planificar el outfit de cada día, a mano o con ayuda de
la API de Gemini. Todo se guarda en el propio iPhone (IndexedDB); no hay
backend.

## 1. Publicarla en GitHub Pages (gratis, sin Mac ni cuenta de desarrollador)

1. Crea un repositorio nuevo en GitHub (puede ser público o privado; si es
   privado necesitarás GitHub Pro para Pages).
2. Sube **todo el contenido de esta carpeta** (no la carpeta en sí, sino su
   contenido: `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `icons/`)
   a la raíz del repositorio. Puedes hacerlo desde el navegador con
   "Add file → Upload files", arrastrando todos los archivos y carpetas.
3. Ve a **Settings → Pages** del repositorio.
4. En "Build and deployment", elige **Deploy from a branch**, rama `main`
   (o `master`) y carpeta `/ (root)`. Guarda.
5. Espera 1–2 minutos. GitHub te dará una URL del tipo
   `https://tu-usuario.github.io/tu-repositorio/`.

Cada vez que cambies algo, vuelve a subir los archivos modificados (o usa git
si lo prefieres) y sube en 1 el número de `CACHE_NAME` en `sw.js` para que los
iPhones que ya tengan la app instalada descarguen la versión nueva.

## 2. Instalarla en el iPhone

1. Abre la URL de GitHub Pages **en Safari** (tiene que ser Safari, no Chrome).
2. Toca el icono de compartir (el cuadrado con la flecha hacia arriba).
3. Elige **"Añadir a pantalla de inicio"**.
4. Ábrela desde el icono de tu pantalla de inicio: se abrirá a pantalla
   completa, como una app nativa.

## 3. Configurar Gemini (opcional, para "Generar con Gemini")

1. Consigue una API key gratuita en https://aistudio.google.com/apikey
2. Dentro de la app: icono de menú (arriba a la izquierda) → **Configuración
   de Gemini** → pega tu API key → Guardar.
3. La key se guarda solo en tu dispositivo (IndexedDB), nunca en el código ni
   en ningún servidor de terceros.

## 4. Cómo funciona el recorte de fotos

Al crear una prenda, elige siempre una foto tomada **sobre un fondo marrón
uniforme**. La app detecta ese color de fondo automáticamente en las esquinas
de la imagen, lo hace transparente y recorta la foto al contorno de la
prenda — todo en el propio dispositivo, sin enviar la imagen a ningún sitio.
El color principal y secundario de la prenda también se calculan solos a
partir de los píxeles resultantes.

## 5. Copia de seguridad

Las PWA instaladas desde Safari pueden perder sus datos si Safari decide
liberar espacio y llevas mucho tiempo sin abrir la app. Por eso, en
**Configuración → Copia de seguridad** puedes exportar un archivo `.json` con
todo tu vestidor, tus outfits y tus personas (fotos incluidas, en base64), y
volver a importarlo cuando lo necesites. Se recomienda exportar de vez en
cuando y guardar el archivo en iCloud Drive, Files, o donde prefieras.

## Estructura del proyecto

```
index.html          Esqueleto de la app
manifest.json        Manifest de la PWA
sw.js                 Service worker (funcionamiento offline)
css/style.css         Estilos (tema oscuro + rojo)
js/db.js               Capa de persistencia (IndexedDB)
js/crop.js             Recorte de fondo + color dominante
js/colors.js           Paleta de nombres de color en español
js/gemini.js           Llamada a la API de Gemini
js/backup.js           Exportar / importar copia de seguridad
js/app.js              Toda la lógica de pantallas y navegación
icons/                 Iconos de la PWA
```

No hay paso de compilación: es HTML/CSS/JS servido tal cual.

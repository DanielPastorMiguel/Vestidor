// crop.js — utilidades de imagen: redimensionar y "pincel" para tomar el color de un píxel.
// El recorte de fondo ya NO se hace aquí con un algoritmo local: se delega a Gemini (ver gemini.js).

const MAX_DIM = 1100;

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Lee un archivo de imagen, lo redimensiona si es muy grande y devuelve
 * tanto el dataURL (para mostrarlo) como el base64 puro + mime type
 * (para enviarlo tal cual a la API de Gemini).
 */
export async function loadAndResizeImage(file, maxDim = MAX_DIM) {
  const img = await loadImageFromFile(file);
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const mimeType = 'image/png';
  const dataUrl = canvas.toDataURL(mimeType);
  const base64 = dataUrl.split(',')[1];
  return { dataUrl, base64, mimeType };
}

/**
 * Convierte un dataURL cualquiera (por ejemplo, el que devuelve Gemini) en
 * {base64, mimeType}, útil para reenviarlo o guardarlo.
 */
export function dataUrlToBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return { base64: null, mimeType: null };
  return { mimeType: match[1], base64: match[2] };
}

/**
 * "Pincel" de color: dado un dataURL y una posición relativa (0..1, 0..1)
 * sobre la imagen tal y como se ve en pantalla, devuelve el color hexadecimal
 * del píxel más cercano en la imagen real.
 */
export async function getPixelHexAt(dataUrl, xFraction, yFraction) {
  const img = await loadImageFromDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(xFraction * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.round(yFraction * canvas.height)));
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

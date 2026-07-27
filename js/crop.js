// crop.js — recorte por color de fondo (chroma key) + extracción de color dominante
import { nearestColorName } from './colors.js';

const MAX_DIM = 1100;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function sampleCorners(data, w, h) {
  // Promedia parches de 12x12 en cada esquina para estimar el color de fondo
  const patch = 12;
  const points = [
    [0, 0],
    [w - patch, 0],
    [0, h - patch],
    [w - patch, h - patch],
  ];
  let r = 0, g = 0, b = 0, n = 0;
  for (const [px, py] of points) {
    for (let y = py; y < py + patch; y++) {
      for (let x = px; x < px + patch; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
  }
  return [r / n, g / n, b / n];
}

function colorDist(r, g, b, ref) {
  return Math.sqrt((r - ref[0]) ** 2 + (g - ref[1]) ** 2 + (b - ref[2]) ** 2);
}

/**
 * Procesa una foto tomada sobre fondo marrón uniforme:
 * elimina el fondo por color, recorta al bounding box de la prenda
 * y calcula color principal / secundario dominantes.
 */
export async function processGarmentPhoto(file) {
  const img = await loadImage(file);

  // Escalamos si la imagen es muy grande, por rendimiento
  let { width, height } = img;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const bg = sampleCorners(data, width, height);

  const T_IN = 32; // distancia por debajo de la cual es 100% fondo
  const T_OUT = 62; // distancia por encima de la cual es 100% prenda

  let minX = width, minY = height, maxX = 0, maxY = 0;
  const colorCounts = new Map();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const d = colorDist(r, g, b, bg);
      let alpha;
      if (d <= T_IN) alpha = 0;
      else if (d >= T_OUT) alpha = 255;
      else alpha = Math.round(((d - T_IN) / (T_OUT - T_IN)) * 255);
      data[i + 3] = alpha;

      if (alpha > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (alpha > 200) {
        // cuantizamos para histograma de color dominante
        const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Si no se detectó nada (foto sin fondo uniforme), usamos la imagen completa
  if (maxX <= minX || maxY <= minY) {
    minX = 0; minY = 0; maxX = width; maxY = height;
  }

  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);
  const cropW = maxX - minX;
  const cropH = maxY - minY;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

  // Colores dominantes
  const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0) || 1;
  let colorPrincipal = null;
  let colorSecundario = null;
  if (sorted.length) {
    const [k1] = sorted[0];
    colorPrincipal = nearestColorName(k1.split(',').map(Number));
    for (let i = 1; i < sorted.length; i++) {
      const [k2, c2] = sorted[i];
      if (c2 / total < 0.12) break;
      const name2 = nearestColorName(k2.split(',').map(Number));
      if (name2 !== colorPrincipal) {
        colorSecundario = name2;
        break;
      }
    }
  }

  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    colorPrincipal: colorPrincipal || 'gris',
    colorSecundario,
  };
}

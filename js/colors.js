// colors.js — mapea colores RGB a nombres en español
export const PALETTE = [
  { name: 'negro', rgb: [20, 20, 20] },
  { name: 'blanco', rgb: [245, 245, 245] },
  { name: 'gris', rgb: [130, 130, 130] },
  { name: 'gris claro', rgb: [200, 200, 200] },
  { name: 'gris oscuro', rgb: [70, 70, 70] },
  { name: 'beige', rgb: [222, 202, 168] },
  { name: 'marrón', rgb: [101, 67, 33] },
  { name: 'camel', rgb: [193, 154, 107] },
  { name: 'azul marino', rgb: [20, 30, 80] },
  { name: 'azul', rgb: [40, 90, 200] },
  { name: 'azul claro', rgb: [140, 190, 230] },
  { name: 'celeste', rgb: [170, 215, 235] },
  { name: 'verde', rgb: [40, 120, 60] },
  { name: 'verde oliva', rgb: [107, 114, 60] },
  { name: 'verde claro', rgb: [150, 200, 140] },
  { name: 'rojo', rgb: [200, 30, 40] },
  { name: 'granate', rgb: [110, 20, 30] },
  { name: 'rosa', rgb: [230, 160, 180] },
  { name: 'fucsia', rgb: [220, 30, 140] },
  { name: 'naranja', rgb: [230, 120, 30] },
  { name: 'amarillo', rgb: [230, 210, 50] },
  { name: 'mostaza', rgb: [200, 160, 40] },
  { name: 'morado', rgb: [110, 60, 150] },
  { name: 'lila', rgb: [180, 160, 220] },
  { name: 'turquesa', rgb: [40, 170, 170] },
];

function dist2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

export function nearestColorName(rgb) {
  let best = PALETTE[0];
  let bestD = Infinity;
  for (const c of PALETTE) {
    const d = dist2(rgb, c.rgb);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
}

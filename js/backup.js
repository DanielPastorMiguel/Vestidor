// backup.js — exportar / importar toda la base de datos como un archivo JSON
import { DB } from './db.js';

export async function exportarDatos() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `vestidor-backup-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importarDatos(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || (!data.prendas && !data.outfits && !data.personas)) {
    throw new Error('El archivo no parece una copia de seguridad válida.');
  }
  await DB.importAll(data);
}

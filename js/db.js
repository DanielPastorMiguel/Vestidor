// db.js — capa de persistencia sobre IndexedDB
const DB_NAME = 'armario-db';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('prendas')) {
        const store = db.createObjectStore('prendas', { keyPath: 'id' });
        store.createIndex('categoria', 'categoria', { unique: false });
        store.createIndex('activa', 'activa', { unique: false });
      }
      if (!db.objectStoreNames.contains('outfits')) {
        db.createObjectStore('outfits', { keyPath: 'fecha' });
      }
      if (!db.objectStoreNames.contains('personas')) {
        db.createObjectStore('personas', { keyPath: 'nombre' });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const DB = {
  // ---------- PRENDAS ----------
  async addPrenda(prenda) {
    const store = await tx('prendas', 'readwrite');
    await reqToPromise(store.add(prenda));
    return prenda;
  },
  async updatePrenda(prenda) {
    const store = await tx('prendas', 'readwrite');
    await reqToPromise(store.put(prenda));
    return prenda;
  },
  async getPrenda(id) {
    const store = await tx('prendas');
    return reqToPromise(store.get(id));
  },
  async getAllPrendas({ soloActivas = false } = {}) {
    const store = await tx('prendas');
    const all = await reqToPromise(store.getAll());
    return soloActivas ? all.filter((p) => p.activa) : all;
  },

  // ---------- OUTFITS ----------
  async setOutfit(outfit) {
    const store = await tx('outfits', 'readwrite');
    await reqToPromise(store.put(outfit));
    return outfit;
  },
  async getOutfit(fecha) {
    const store = await tx('outfits');
    return reqToPromise(store.get(fecha));
  },
  async getAllOutfits() {
    const store = await tx('outfits');
    return reqToPromise(store.getAll());
  },
  async deleteOutfit(fecha) {
    const store = await tx('outfits', 'readwrite');
    return reqToPromise(store.delete(fecha));
  },

  // ---------- PERSONAS ----------
  async addPersona(persona) {
    const store = await tx('personas', 'readwrite');
    await reqToPromise(store.put(persona));
    return persona;
  },
  async getAllPersonas() {
    const store = await tx('personas');
    return reqToPromise(store.getAll());
  },

  // ---------- CONFIG ----------
  async setConfig(key, value) {
    const store = await tx('config', 'readwrite');
    await reqToPromise(store.put({ key, value }));
  },
  async getConfig(key, fallback = null) {
    const store = await tx('config');
    const res = await reqToPromise(store.get(key));
    return res ? res.value : fallback;
  },

  // ---------- EXPORT/IMPORT ----------
  async exportAll() {
    const [prendas, outfits, personas] = await Promise.all([
      this.getAllPrendas(),
      this.getAllOutfits(),
      this.getAllPersonas(),
    ]);
    return { version: DB_VERSION, exportedAt: new Date().toISOString(), prendas, outfits, personas };
  },
  async importAll(data) {
    const db = await openDB();
    const t = db.transaction(['prendas', 'outfits', 'personas'], 'readwrite');
    const pStore = t.objectStore('prendas');
    const oStore = t.objectStore('outfits');
    const perStore = t.objectStore('personas');
    (data.prendas || []).forEach((p) => pStore.put(p));
    (data.outfits || []).forEach((o) => oStore.put(o));
    (data.personas || []).forEach((per) => perStore.put(per));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};

export function uid() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

import { DB, uid, todayStr } from './db.js';
import { loadAndResizeImage, getPixelHexAt, dataUrlToBase64 } from './crop.js';
import { generarOutfitConGemini, quitarFondoConGemini } from './gemini.js';
import { exportarDatos, importarDatos } from './backup.js';
import { PALETTE } from './colors.js';

/* ===================== CONSTANTES ===================== */
const SUBTIPOS = {
  arriba: ['abrigo', 'americana', 'camisa', 'camiseta', 'chaleco', 'chaqueta', 'jersey', 'blusa', 'vestido'],
  abajo: ['bermudas', 'falda', 'chino', 'vaquero', 'chándal', 'vestido'],
  calzado: ['invierno', 'verano'],
};
const TEMPORADAS = ['verano', 'invierno', 'entretiempo'];
const OCASIONES = ['casual', 'formal', 'deporte', 'fiesta'];
const CATEGORIAS = ['arriba', 'abajo', 'calzado'];
const CATEGORIA_LABEL = { arriba: 'Arriba', abajo: 'Abajo', calzado: 'Calzado' };
const CIUDAD_POR_DEFECTO = 'Ciudad de Madrid, España';

/* ===================== UTILIDADES ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = document.getElementById('view');

function nameToHex(name) {
  const c = PALETTE.find((p) => p.name === (name || '').toLowerCase().trim());
  return c ? '#' + c.rgb.map((v) => v.toString(16).padStart(2, '0')).join('') : null;
}
function colorVisual(prenda, cual) {
  // "cual" es 'principal' o 'secundario'. Prioriza el hex tomado con el pincel;
  // si no existe, intenta adivinarlo a partir del texto escrito por el usuario.
  const hex = cual === 'principal' ? prenda.color_principal_hex : prenda.color_secundario_hex;
  if (hex) return hex;
  const texto = cual === 'principal' ? prenda.color_principal : prenda.color_secundario;
  return nameToHex(texto) || '#555555';
}

function addDays(fechaStr, n) {
  const d = new Date(fechaStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

function fmtFechaLarga(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  const dow = d.toLocaleDateString('es-ES', { weekday: 'long' });
  const dia = d.getDate();
  const mes = d.toLocaleDateString('es-ES', { month: 'long' });
  return { dow: cap(dow), dia, mes: cap(mes) };
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function refocus(el) {
  if (!el) return;
  el.focus();
  const v = el.value;
  try {
    el.setSelectionRange(v.length, v.length);
  } catch (e) {
    /* algunos inputs no soportan setSelectionRange */
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function chipSelectHtml(name, options, selected) {
  return `<div class="chip-select" data-field="${name}">${options
    .map((o) => `<button type="button" data-value="${escapeHtml(o)}" class="${o === selected ? 'active' : ''}">${cap(o)}</button>`)
    .join('')}</div>`;
}
function wireChipSelect(root, name, onChange) {
  const box = $(`.chip-select[data-field="${name}"]`, root);
  if (!box) return;
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $all('button', box).forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    onChange(btn.dataset.value);
  });
}

function switchHtml(id, checked, label, sub) {
  return `<div class="switch-row">
    <div><div class="switch-label">${escapeHtml(label)}</div>${sub ? `<div class="switch-sub">${escapeHtml(sub)}</div>` : ''}</div>
    <label class="switch">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
      <span class="track"><span class="thumb"></span></span>
    </label>
  </div>`;
}

/* ===================== ESTADO ===================== */
const state = {
  selectedDate: todayStr(),
  calendarMonth: new Date(),
  manualDraft: null,
  geminiDraft: null,
};

let prendasCache = null;
async function getPrendas(force = false) {
  if (!prendasCache || force) prendasCache = await DB.getAllPrendas();
  return prendasCache;
}
function invalidatePrendasCache() {
  prendasCache = null;
}

/* ===================== TOAST ===================== */
function toast(msg, type = 'ok') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ===================== MODAL (bottom sheet) ===================== */
function openSheet(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal-sheet"><div class="sheet-handle"></div>${html}</div></div>`;
  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeSheet();
  });
  return $('.modal-sheet');
}
function closeSheet() {
  document.getElementById('modal-root').innerHTML = '';
}

/* ===================== RECONCILIACIÓN DE USO ===================== */
async function reconcilePastOutfits() {
  const today = todayStr();
  const [outfits, prendas] = await Promise.all([DB.getAllOutfits(), getPrendas(true)]);
  const pasados = outfits.filter((o) => o.fecha < today);
  const usage = new Map();
  for (const o of pasados) {
    for (const id of [o.prenda_arriba_id, o.prenda_abajo_id, o.prenda_calzado_id]) {
      if (!id) continue;
      const u = usage.get(id) || { count: 0, last: null };
      u.count++;
      if (!u.last || o.fecha > u.last) u.last = o.fecha;
      usage.set(id, u);
    }
  }
  for (const p of prendas) {
    const u = usage.get(p.id) || { count: 0, last: null };
    if (p.veces_usada !== u.count || p.ultima_vez_usada !== u.last) {
      p.veces_usada = u.count;
      p.ultima_vez_usada = u.last;
      await DB.updatePrenda(p);
    }
  }
  invalidatePrendasCache();
}

async function guardarOutfit(outfit) {
  await DB.setOutfit(outfit);
  await reconcilePastOutfits();
}

/* ===================== HOME ===================== */
async function renderHome() {
  const fecha = state.selectedDate;
  const [outfit, prendas] = await Promise.all([DB.getOutfit(fecha), getPrendas()]);
  const prendaMap = new Map(prendas.map((p) => [p.id, p]));
  const { dow, dia, mes } = fmtFechaLarga(fecha);
  const hasOutfit = !!(outfit && (outfit.prenda_arriba_id || outfit.prenda_abajo_id || outfit.prenda_calzado_id));

  const tile = (categoria, id) => {
    const p = prendaMap.get(id);
    if (!p) return `<div class="photo-tile empty">Sin ${categoria === 'calzado' ? 'calzado' : categoria}</div>`;
    return `<button type="button" class="photo-tile" data-open-prenda="${p.id}">
      <img src="${p.foto_recortada}" alt="${escapeHtml(p.titulo)}" />
    </button>`;
  };

  const personas = (outfit && outfit.personas) || [];

  view.innerHTML = `
    <div class="date-nav">
      <button class="arrow" id="date-prev" aria-label="Día anterior">‹</button>
      <button class="date-label" id="date-open-cal">
        <span class="d1">${dia} ${mes}</span>
        <span class="d2">${dow}</span>
      </button>
      <button class="arrow" id="date-next" aria-label="Día siguiente">›</button>
    </div>

    ${
      hasOutfit
        ? `<div class="photo-stack">
            ${tile('arriba', outfit.prenda_arriba_id)}
            ${tile('abajo', outfit.prenda_abajo_id)}
            ${tile('calzado', outfit.prenda_calzado_id)}
          </div>
          ${
            personas.length
              ? `<div class="section-label">Con</div><div class="personas-list">${personas
                  .map((n) => `<span class="persona-chip">${escapeHtml(n)}</span>`)
                  .join('')}</div>`
              : ''
          }
          ${outfit.notas ? `<div class="reasoning-card">${escapeHtml(outfit.notas)}</div>` : ''}
          <button class="btn btn-outline btn-block" id="btn-toggle-edit" style="margin-top:20px;">Editar outfit</button>
          <div id="edit-outfit-options" class="hidden">
            <button class="choice-card primary" id="btn-gemini">
              <span class="emoji">✨</span>
              <span><span class="title">Generar con Gemini</span></span>
            </button>
            <button class="choice-card" id="btn-manual">
              <span class="emoji">✏️</span>
              <span><span class="title">Crear a mano</span></span>
            </button>
          </div>`
        : `<div class="empty-state">
            <div class="icon">👔</div>
            <div>Todavía no hay outfit para este día</div>
          </div>
          <div class="choice-row">
            <button class="choice-card primary" id="btn-gemini-direct">
              <span class="emoji">✨</span>
              <span><span class="title">Generar con Gemini</span><br/><span class="sub">Tu estilista elige por ti</span></span>
            </button>
            <button class="choice-card" id="btn-manual-direct">
              <span class="emoji">✏️</span>
              <span><span class="title">Crear a mano</span><br/><span class="sub">Elige tú cada prenda</span></span>
            </button>
          </div>`
    }
  `;

  $('#date-prev').addEventListener('click', () => {
    state.selectedDate = addDays(state.selectedDate, -1);
    renderHome();
  });
  $('#date-next').addEventListener('click', () => {
    state.selectedDate = addDays(state.selectedDate, 1);
    renderHome();
  });
  $('#date-open-cal').addEventListener('click', () => {
    state.calendarMonth = new Date(state.selectedDate + 'T00:00:00');
    renderCalendar();
  });
  const goGemini = () => renderGeminiForm();
  const goManual = () => renderManual();
  if ($('#btn-gemini-direct')) $('#btn-gemini-direct').addEventListener('click', goGemini);
  if ($('#btn-manual-direct')) $('#btn-manual-direct').addEventListener('click', goManual);
  if ($('#btn-gemini')) $('#btn-gemini').addEventListener('click', goGemini);
  if ($('#btn-manual')) $('#btn-manual').addEventListener('click', goManual);
  if ($('#btn-toggle-edit')) {
    $('#btn-toggle-edit').addEventListener('click', () => {
      $('#edit-outfit-options').classList.toggle('hidden');
    });
  }
  $all('[data-open-prenda]').forEach((btn) => {
    btn.addEventListener('click', () => openPrendaSheet(btn.dataset.openPrenda));
  });
}

/* ===================== FICHA DE PRENDA (ver + editar) ===================== */
// Núcleo reutilizable: dibuja la ficha de una prenda dentro de cualquier contenedor.
async function paintFicha({ container, id, allowDelete, onBack, onEdit, onDeleted, backIcon = '‹' }) {
  const prenda = await DB.getPrenda(id);
  if (!prenda) return;

  container.innerHTML = `
    <div class="screen-header" style="margin-bottom:14px;">
      <button class="back-btn" id="ficha-back">${backIcon}</button>
      <div class="screen-title" style="font-size:20px;">${escapeHtml(prenda.titulo)}</div>
    </div>
    <div class="detail-photo"><img src="${prenda.foto_recortada}" alt=""/></div>
    <div class="detail-grid">
      <div><div class="k">Categoría</div><div class="v">${CATEGORIA_LABEL[prenda.categoria]}</div></div>
      <div><div class="k">Subtipo</div><div class="v">${cap(prenda.subtipo)}</div></div>
      <div><div class="k">Color principal</div><div class="v"><span class="swatch" style="background:${colorVisual(prenda, 'principal')}"></span>${escapeHtml(
    prenda.color_principal
  )}</div></div>
      <div><div class="k">Color secundario</div><div class="v">${
        prenda.color_secundario
          ? `<span class="swatch" style="background:${colorVisual(prenda, 'secundario')}"></span>${escapeHtml(prenda.color_secundario)}`
          : '—'
      }</div></div>
      <div><div class="k">Temporada</div><div class="v">${cap(prenda.temporada)}</div></div>
      <div><div class="k">Ocasión</div><div class="v">${cap(prenda.ocasion)}</div></div>
      <div><div class="k">Veces usada</div><div class="v">${prenda.veces_usada || 0}</div></div>
      <div><div class="k">Última vez</div><div class="v">${prenda.ultima_vez_usada || '—'}</div></div>
      <div><div class="k">Añadida</div><div class="v">${prenda.fecha_anadida}</div></div>
    </div>
    <div class="action-row">
      <button class="btn btn-outline btn-block" id="ficha-editar">Editar</button>
      ${allowDelete ? `<button class="btn btn-danger" id="ficha-eliminar">Eliminar</button>` : ''}
    </div>
  `;
  $('#ficha-back', container).addEventListener('click', onBack);
  $('#ficha-editar', container).addEventListener('click', onEdit);
  if (allowDelete && $('#ficha-eliminar', container)) {
    $('#ficha-eliminar', container).addEventListener('click', () => {
      openSheet(`
        <div class="screen-title" style="margin-bottom:10px;">¿Eliminar "${escapeHtml(prenda.titulo)}"?</div>
        <div class="screen-sub">No se borrará el histórico de outfits que la usaron.</div>
        <div class="action-row">
          <button class="btn btn-outline" id="del-cancel">Cancelar</button>
          <button class="btn btn-danger" id="del-confirm">Eliminar</button>
        </div>
      `);
      $('#del-cancel').addEventListener('click', closeSheet);
      $('#del-confirm').addEventListener('click', async () => {
        prenda.activa = false;
        await DB.updatePrenda(prenda);
        invalidatePrendasCache();
        closeSheet();
        toast('Prenda eliminada del vestidor');
        onDeleted();
      });
    });
  }
}

// Ficha abierta desde la Home al tocar una foto del outfit del día: sin opción de eliminar.
function openPrendaSheet(id) {
  const container = openSheet(`<div id="sheet-ficha"></div>`);
  const inner = $('#sheet-ficha', container);

  const showFicha = () =>
    paintFicha({
      container: inner,
      id,
      allowDelete: false,
      backIcon: '✕',
      onBack: () => {
        closeSheet();
        renderHome();
      },
      onEdit: showEdit,
    });

  const showEdit = () =>
    paintPrendaForm({
      container: inner,
      editId: id,
      backIcon: '‹',
      onSaved: showFicha,
      onCancel: showFicha,
    });

  showFicha();
}

/* ===================== CALENDARIO ===================== */
async function renderCalendar() {
  const month = state.calendarMonth;
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthLabel = cap(first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));

  const [outfits, prendas] = await Promise.all([DB.getAllOutfits(), getPrendas()]);
  const prendaMap = new Map(prendas.map((p) => [p.id, p]));
  const outfitMap = new Map(outfits.map((o) => [o.fecha, o]));
  const today = todayStr();

  const dows = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  let cells = '';
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(y, m, 1 - (startOffset - i));
    cells += dayCellHtml(d, true, outfitMap, prendaMap, today);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells += dayCellHtml(new Date(y, m, d), false, outfitMap, prendaMap, today);
  }
  const totalCells = startOffset + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    cells += dayCellHtml(new Date(y, m + 1, i), true, outfitMap, prendaMap, today);
  }

  view.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="cal-back">‹</button>
      <div class="screen-title">CALENDARIO</div>
    </div>
    <div class="cal-header">
      <button class="arrow" id="cal-prev-month">‹</button>
      <div class="cal-month">${monthLabel}</div>
      <button class="arrow" id="cal-next-month">›</button>
    </div>
    <div class="cal-grid">
      ${dows.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
  `;

  $('#cal-back').addEventListener('click', renderHome);
  $('#cal-prev-month').addEventListener('click', () => {
    state.calendarMonth = new Date(y, m - 1, 1);
    renderCalendar();
  });
  $('#cal-next-month').addEventListener('click', () => {
    state.calendarMonth = new Date(y, m + 1, 1);
    renderCalendar();
  });
  $all('.cal-day[data-fecha]').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedDate = el.dataset.fecha;
      renderHome();
    });
  });
}

function dayCellHtml(dateObj, otherMonth, outfitMap, prendaMap, today) {
  const fecha = todayStr(dateObj);
  const outfit = outfitMap.get(fecha);
  const classes = ['cal-day'];
  if (otherMonth) classes.push('other-month');
  if (fecha === today) classes.push('today');
  if (fecha === state.selectedDate) classes.push('selected');

  let bars = '';
  if (outfit) {
    const cats = [outfit.prenda_arriba_id, outfit.prenda_abajo_id, outfit.prenda_calzado_id];
    bars = `<div class="bars">${cats
      .map((id) => {
        const p = prendaMap.get(id);
        if (!p) return `<div class="bar"><span style="width:100%;background:#333"></span></div>`;
        const c1 = colorVisual(p, 'principal');
        const c2 = p.color_secundario ? colorVisual(p, 'secundario') : null;
        return `<div class="bar"><span style="width:${c2 ? '70%' : '100%'};background:${c1}"></span>${
          c2 ? `<span style="width:30%;background:${c2}"></span>` : ''
        }</div>`;
      })
      .join('')}</div>`;
  }

  return `<button class="${classes.join(' ')}" data-fecha="${fecha}">
    <span>${dateObj.getDate()}</span>
    ${bars}
  </button>`;
}

/* ===================== CREAR OUTFIT A MANO ===================== */
async function renderManual() {
  const fecha = state.selectedDate;
  if (!state.manualDraft || state.manualDraft.fecha !== fecha) {
    const existing = await DB.getOutfit(fecha);
    state.manualDraft = {
      fecha,
      prenda_arriba_id: existing?.prenda_arriba_id || null,
      prenda_abajo_id: existing?.prenda_abajo_id || null,
      prenda_calzado_id: existing?.prenda_calzado_id || null,
      personas: existing?.personas ? [...existing.personas] : [],
      notas: existing?.notas || '',
    };
  }
  await paintManual();
}

async function paintManual() {
  const draft = state.manualDraft;
  const prendas = await getPrendas();
  const prendaMap = new Map(prendas.map((p) => [p.id, p]));
  const { dow, dia, mes } = fmtFechaLarga(draft.fecha);

  const catBlock = (categoria, id) => {
    const p = prendaMap.get(id);
    return `<div class="field">
      <label>${CATEGORIA_LABEL[categoria]}</label>
      <button type="button" class="outfit-row" data-pick="${categoria}" style="width:100%;">
        ${
          p
            ? `<div class="thumb"><img src="${p.foto_recortada}" alt=""/></div>
               <div class="meta"><div class="titulo">${escapeHtml(p.titulo)}</div><div class="colores">${escapeHtml(p.color_principal)}${
                p.color_secundario ? ' / ' + escapeHtml(p.color_secundario) : ''
              }</div></div>`
            : `<span style="color:var(--text-faint)">Elegir ${categoria === 'calzado' ? 'calzado' : 'prenda de ' + categoria}</span>`
        }
      </button>
    </div>`;
  };

  view.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="manual-back">‹</button>
      <div class="screen-title">CREAR A MANO</div>
    </div>
    <div class="screen-sub">${dow}, ${dia} de ${mes}</div>

    ${catBlock('arriba', draft.prenda_arriba_id)}
    ${catBlock('abajo', draft.prenda_abajo_id)}
    ${catBlock('calzado', draft.prenda_calzado_id)}

    <div class="field">
      <label>Personas</label>
      <div class="personas-list" id="manual-personas">
        ${draft.personas.map((n) => `<span class="persona-chip removable" data-nombre="${escapeHtml(n)}">${escapeHtml(n)}<span class="x">✕</span></span>`).join('')}
        <button type="button" class="persona-chip" id="btn-add-persona" style="border-style:dashed;">+ Añadir</button>
      </div>
    </div>

    <div class="field">
      <label>Notas (opcional)</label>
      <textarea id="manual-notas" placeholder="Cualquier apunte sobre este outfit...">${escapeHtml(draft.notas)}</textarea>
    </div>

    <button class="btn btn-primary btn-block" id="manual-guardar">Guardar outfit</button>
  `;

  $('#manual-back').addEventListener('click', () => {
    state.manualDraft = null;
    renderHome();
  });
  $all('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => openGarmentPicker(btn.dataset.pick));
  });
  $('#btn-add-persona').addEventListener('click', openPersonaPicker);
  $all('#manual-personas .x').forEach((x) => {
    x.addEventListener('click', (e) => {
      const nombre = e.target.closest('.persona-chip').dataset.nombre;
      draft.personas = draft.personas.filter((n) => n !== nombre);
      paintManual();
    });
  });
  $('#manual-notas').addEventListener('input', (e) => {
    draft.notas = e.target.value;
  });
  $('#manual-guardar').addEventListener('click', async () => {
    if (!draft.prenda_arriba_id && !draft.prenda_abajo_id && !draft.prenda_calzado_id) {
      toast('Elige al menos una prenda', 'error');
      return;
    }
    await guardarOutfit({ ...draft, origen: 'manual' });
    state.manualDraft = null;
    toast('Outfit guardado');
    renderHome();
  });
}

function openGarmentPicker(categoria) {
  let query = '';
  let subtipoFiltro = null;

  const paint = async () => {
    const prendas = (await getPrendas()).filter((p) => p.activa && p.categoria === categoria);
    const filtradas = prendas.filter((p) => {
      if (subtipoFiltro && p.subtipo !== subtipoFiltro) return false;
      if (query && !p.titulo.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    const sheet = openSheet(`
      <div class="screen-title" style="margin-bottom:10px;">Elegir ${CATEGORIA_LABEL[categoria].toLowerCase()}</div>
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" id="picker-search" placeholder="Buscar por título..." value="${escapeHtml(query)}" />
      </div>
      <div class="chip-select" id="picker-subtipos" style="margin-bottom:14px;">
        <button type="button" data-value="" class="${!subtipoFiltro ? 'active' : ''}">Todos</button>
        ${SUBTIPOS[categoria]
          .map((s) => `<button type="button" data-value="${s}" class="${subtipoFiltro === s ? 'active' : ''}">${cap(s)}</button>`)
          .join('')}
      </div>
      <div class="garment-grid" id="picker-grid">
        ${
          filtradas.length
            ? filtradas
                .map(
                  (p) => `<button type="button" class="garment-card" data-id="${p.id}">
                <div class="thumb"><img src="${p.foto_recortada}" alt=""/></div>
                <div class="cap"><div class="t">${escapeHtml(p.titulo)}</div><div class="c">${escapeHtml(p.subtipo)}</div></div>
              </button>`
                )
                .join('')
            : `<div class="garment-empty">No hay prendas que coincidan</div>`
        }
      </div>
    `);
    $('#picker-search', sheet).addEventListener('input', (e) => {
      query = e.target.value;
      keepFocus = true;
      paint();
    });
    $('#picker-subtipos', sheet).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      subtipoFiltro = b.dataset.value || null;
      paint();
    });
    $all('.garment-card', sheet).forEach((c) => {
      c.addEventListener('click', () => {
        state.manualDraft['prenda_' + categoria + '_id'] = c.dataset.id;
        closeSheet();
        paintManual();
      });
    });
    if (keepFocus) refocus($('#picker-search', sheet));
  };
  let keepFocus = false;
  paint();
}

async function openPersonaPicker() {
  const draft = state.manualDraft;
  let query = '';
  const paint = async () => {
    const personas = await DB.getAllPersonas();
    const filtradas = personas.filter((p) => p.nombre.toLowerCase().includes(query.toLowerCase()));
    const sheet = openSheet(`
      <div class="screen-title" style="margin-bottom:10px;">Personas</div>
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" id="persona-search" placeholder="Buscar o añadir nueva..." value="${escapeHtml(query)}" />
      </div>
      <div id="persona-list">
        ${filtradas
          .map(
            (p) => `<div class="persona-pick-row" data-nombre="${escapeHtml(p.nombre)}">
              <span class="name">${escapeHtml(p.nombre)}</span>
              <span class="checkbox ${draft.personas.includes(p.nombre) ? 'checked' : ''}">✓</span>
            </div>`
          )
          .join('')}
      </div>
      ${
        query && !personas.some((p) => p.nombre.toLowerCase() === query.toLowerCase())
          ? `<button class="btn btn-outline btn-block" id="persona-add-new" style="margin-top:10px;">+ Añadir "${escapeHtml(query)}"</button>`
          : ''
      }
      <button class="btn btn-primary btn-block" id="persona-done" style="margin-top:16px;">Listo</button>
    `);
    $('#persona-search', sheet).addEventListener('input', (e) => {
      query = e.target.value;
      keepFocus = true;
      paint();
    });
    $all('.persona-pick-row', sheet).forEach((row) => {
      row.addEventListener('click', () => {
        const nombre = row.dataset.nombre;
        if (draft.personas.includes(nombre)) draft.personas = draft.personas.filter((n) => n !== nombre);
        else draft.personas.push(nombre);
        paint();
      });
    });
    if ($('#persona-add-new', sheet)) {
      $('#persona-add-new', sheet).addEventListener('click', async () => {
        await DB.addPersona({ nombre: query });
        draft.personas.push(query);
        query = '';
        paint();
      });
    }
    $('#persona-done', sheet).addEventListener('click', () => {
      closeSheet();
      paintManual();
    });
    if (keepFocus) refocus($('#persona-search', sheet));
  };
  let keepFocus = false;
  paint();
}

/* ===================== GENERAR CON GEMINI ===================== */
async function renderGeminiForm() {
  const fecha = state.selectedDate;
  if (!state.geminiDraft || state.geminiDraft.fecha !== fecha) {
    state.geminiDraft = { fecha, ocasion: 'casual', temporada: 'entretiempo', personas: [], ciudad: CIUDAD_POR_DEFECTO, comentarios: '' };
  }
  const draft = state.geminiDraft;
  const { dow, dia, mes } = fmtFechaLarga(fecha);

  view.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="gemini-back">‹</button>
      <div class="screen-title">GENERAR CON GEMINI</div>
    </div>
    <div class="screen-sub">${dow}, ${dia} de ${mes}</div>

    <div class="field">
      <label>Ocasión</label>
      ${chipSelectHtml('ocasion', OCASIONES, draft.ocasion)}
    </div>
    <div class="field">
      <label>Temporada</label>
      ${chipSelectHtml('temporada', TEMPORADAS, draft.temporada)}
    </div>
    <div class="field">
      <label>Personas</label>
      <div class="personas-list" id="gemini-personas">
        ${draft.personas.map((n) => `<span class="persona-chip removable" data-nombre="${escapeHtml(n)}">${escapeHtml(n)}<span class="x">✕</span></span>`).join('')}
        <button type="button" class="persona-chip" id="btn-add-persona-g" style="border-style:dashed;">+ Añadir</button>
      </div>
    </div>
    <div class="field">
      <label>Ciudad</label>
      <input type="text" id="gemini-ciudad" placeholder="Ej: Madrid" value="${escapeHtml(draft.ciudad)}" />
    </div>
    <div class="field">
      <label>Comentarios</label>
      <textarea id="gemini-comentarios" placeholder="Ej: quiero ir cómodo, va a llover...">${escapeHtml(draft.comentarios)}</textarea>
    </div>

    <button class="btn btn-primary btn-block" id="gemini-generar">✨ Generar outfit</button>
  `;

  $('#gemini-back').addEventListener('click', () => {
    state.geminiDraft = null;
    renderHome();
  });
  wireChipSelect(view, 'ocasion', (v) => (draft.ocasion = v));
  wireChipSelect(view, 'temporada', (v) => (draft.temporada = v));
  $('#gemini-ciudad').addEventListener('input', (e) => (draft.ciudad = e.target.value));
  $('#gemini-comentarios').addEventListener('input', (e) => (draft.comentarios = e.target.value));
  $('#btn-add-persona-g').addEventListener('click', () => openPersonaPickerGemini());
  $all('#gemini-personas .x').forEach((x) => {
    x.addEventListener('click', (e) => {
      const nombre = e.target.closest('.persona-chip').dataset.nombre;
      draft.personas = draft.personas.filter((n) => n !== nombre);
      renderGeminiForm();
    });
  });
  $('#gemini-generar').addEventListener('click', handleGenerar);
}

async function openPersonaPickerGemini() {
  const draft = state.geminiDraft;
  let query = '';
  const paint = async () => {
    const personas = await DB.getAllPersonas();
    const filtradas = personas.filter((p) => p.nombre.toLowerCase().includes(query.toLowerCase()));
    const sheet = openSheet(`
      <div class="screen-title" style="margin-bottom:10px;">Personas</div>
      <div class="search-bar"><span>🔍</span><input type="text" id="persona-search" placeholder="Buscar o añadir nueva..." value="${escapeHtml(
        query
      )}" /></div>
      <div id="persona-list">
        ${filtradas
          .map(
            (p) => `<div class="persona-pick-row" data-nombre="${escapeHtml(p.nombre)}">
              <span class="name">${escapeHtml(p.nombre)}</span>
              <span class="checkbox ${draft.personas.includes(p.nombre) ? 'checked' : ''}">✓</span>
            </div>`
          )
          .join('')}
      </div>
      ${
        query && !personas.some((p) => p.nombre.toLowerCase() === query.toLowerCase())
          ? `<button class="btn btn-outline btn-block" id="persona-add-new" style="margin-top:10px;">+ Añadir "${escapeHtml(query)}"</button>`
          : ''
      }
      <button class="btn btn-primary btn-block" id="persona-done" style="margin-top:16px;">Listo</button>
    `);
    $('#persona-search', sheet).addEventListener('input', (e) => {
      query = e.target.value;
      keepFocus = true;
      paint();
    });
    $all('.persona-pick-row', sheet).forEach((row) => {
      row.addEventListener('click', () => {
        const nombre = row.dataset.nombre;
        if (draft.personas.includes(nombre)) draft.personas = draft.personas.filter((n) => n !== nombre);
        else draft.personas.push(nombre);
        paint();
      });
    });
    if ($('#persona-add-new', sheet)) {
      $('#persona-add-new', sheet).addEventListener('click', async () => {
        await DB.addPersona({ nombre: query });
        draft.personas.push(query);
        query = '';
        paint();
      });
    }
    $('#persona-done', sheet).addEventListener('click', () => {
      closeSheet();
      renderGeminiForm();
    });
    if (keepFocus) refocus($('#persona-search', sheet));
  };
  let keepFocus = false;
  paint();
}

async function candidatosParaCategoria(categoria, { prendas, outfits, fecha, personas, diasNoRepetir }) {
  const desde = addDays(fecha, -diasNoRepetir);
  const usadosRecientes = new Set();
  for (const o of outfits) {
    if (o.fecha >= desde && o.fecha < fecha) {
      const compartePersonas = personas.length === 0 ? true : (o.personas || []).some((p) => personas.includes(p));
      if (compartePersonas) {
        [o.prenda_arriba_id, o.prenda_abajo_id, o.prenda_calzado_id].forEach((id) => id && usadosRecientes.add(id));
      }
    }
  }
  let candidatos = prendas.filter((p) => p.activa && p.categoria === categoria && !usadosRecientes.has(p.id));
  if (candidatos.length === 0) candidatos = prendas.filter((p) => p.activa && p.categoria === categoria);
  return candidatos;
}

async function handleGenerar() {
  const draft = state.geminiDraft;
  if (!draft.ciudad || !draft.ciudad.trim()) draft.ciudad = CIUDAD_POR_DEFECTO;

  view.innerHTML = `
    <div class="screen-header"><div class="screen-title">GENERANDO...</div></div>
    <div class="loading-block"><div class="spinner"></div><span>Consultando a tu estilista...</span></div>
  `;

  try {
    const diasNoRepetir = (await DB.getConfig('dias_no_repetir')) || 14;
    const [prendas, outfits] = await Promise.all([getPrendas(true), DB.getAllOutfits()]);

    const candArriba = await candidatosParaCategoria('arriba', { prendas, outfits, fecha: draft.fecha, personas: draft.personas, diasNoRepetir });
    const candAbajo = await candidatosParaCategoria('abajo', { prendas, outfits, fecha: draft.fecha, personas: draft.personas, diasNoRepetir });
    const candCalzado = await candidatosParaCategoria('calzado', { prendas, outfits, fecha: draft.fecha, personas: draft.personas, diasNoRepetir });
    const candidatos = [...candArriba, ...candAbajo, ...candCalzado];

    if (!candArriba.length || !candAbajo.length || !candCalzado.length) {
      throw new Error('No hay prendas activas suficientes en el vestidor para alguna categoría.');
    }

    const resultado = await generarOutfitConGemini({
      fecha: draft.fecha,
      ocasion: draft.ocasion,
      temporada: draft.temporada,
      ciudad: draft.ciudad,
      comentarios: draft.comentarios,
      candidatos,
    });

    renderGeminiResult(resultado);
  } catch (err) {
    renderGeminiError(err.message || 'Error desconocido al generar el outfit.');
  }
}

function renderGeminiError(mensaje) {
  view.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="err-back">‹</button>
      <div class="screen-title">NO SE PUDO GENERAR</div>
    </div>
    <div class="empty-state">
      <div class="icon">⚠️</div>
      <div>${escapeHtml(mensaje)}</div>
    </div>
    <div class="action-row">
      <button class="btn btn-outline" id="err-retry">Reintentar</button>
      <button class="btn btn-primary" id="err-manual">Crear a mano</button>
    </div>
  `;
  $('#err-back').addEventListener('click', renderGeminiForm);
  $('#err-retry').addEventListener('click', handleGenerar);
  $('#err-manual').addEventListener('click', renderManual);
}

async function renderGeminiResult(resultado) {
  const draft = state.geminiDraft;
  const prendas = await getPrendas();
  const prendaMap = new Map(prendas.map((p) => [p.id, p]));

  const fila = (categoria, id) => {
    const p = prendaMap.get(id);
    if (!p) return `<div class="outfit-row empty"><span>Sin ${categoria}</span></div>`;
    return `<div class="outfit-row">
      <div class="thumb"><img src="${p.foto_recortada}" alt=""/></div>
      <div class="meta">
        <div class="cat-label">${CATEGORIA_LABEL[categoria]}</div>
        <div class="titulo">${escapeHtml(p.titulo)}</div>
        <div class="colores">${escapeHtml(p.color_principal)}${p.color_secundario ? ' / ' + escapeHtml(p.color_secundario) : ''}</div>
      </div>
    </div>`;
  };

  view.innerHTML = `
    <div class="screen-header">
      <button class="back-btn" id="res-back">‹</button>
      <div class="screen-title">TU OUTFIT</div>
    </div>
    <div class="outfit-grid">
      ${fila('arriba', resultado.prenda_arriba_id)}
      ${fila('abajo', resultado.prenda_abajo_id)}
      ${fila('calzado', resultado.prenda_calzado_id)}
    </div>
    <div class="reasoning-card">${escapeHtml(resultado.razonamiento || '')}</div>
    <div class="action-row">
      <button class="btn btn-outline" id="res-regenerar">Repetir</button>
      <button class="btn btn-primary" id="res-guardar">Guardar</button>
    </div>
    <button class="btn btn-ghost btn-block" id="res-editar" style="margin-top:10px;">Editar a mano</button>
  `;

  $('#res-back').addEventListener('click', renderGeminiForm);
  $('#res-regenerar').addEventListener('click', handleGenerar);
  $('#res-guardar').addEventListener('click', async () => {
    await guardarOutfit({
      fecha: draft.fecha,
      prenda_arriba_id: resultado.prenda_arriba_id,
      prenda_abajo_id: resultado.prenda_abajo_id,
      prenda_calzado_id: resultado.prenda_calzado_id,
      personas: draft.personas,
      origen: 'gemini',
      notas: resultado.razonamiento || '',
    });
    state.geminiDraft = null;
    toast('Outfit guardado');
    renderHome();
  });
  $('#res-editar').addEventListener('click', () => {
    state.manualDraft = {
      fecha: draft.fecha,
      prenda_arriba_id: resultado.prenda_arriba_id,
      prenda_abajo_id: resultado.prenda_abajo_id,
      prenda_calzado_id: resultado.prenda_calzado_id,
      personas: draft.personas,
      notas: resultado.razonamiento || '',
    };
    paintManual();
  });
}

/* ===================== EYEDROPPER (pincel de color) ===================== */
// Abre un selector visual sobre la foto para tomar el color de un píxel exacto.
function openEyedropper(dataUrl, onPick) {
  const sheet = openSheet(`
    <div class="screen-title" style="margin-bottom:6px;">Elige un color de la prenda</div>
    <div class="eyedropper-hint">Toca cualquier punto de la foto para tomar ese color</div>
    <div class="eyedropper-wrap" id="eyedropper-wrap">
      <img src="${dataUrl}" alt="" id="eyedropper-img" />
    </div>
    <div class="eyedropper-preview" id="eyedropper-preview"></div>
    <button class="btn btn-primary btn-block" id="eyedropper-done" style="margin-top:16px;" disabled>Usar este color</button>
  `);
  const wrap = $('#eyedropper-wrap', sheet);
  const img = $('#eyedropper-img', sheet);
  const preview = $('#eyedropper-preview', sheet);
  const doneBtn = $('#eyedropper-done', sheet);
  let picked = null;

  const pickAt = async (clientX, clientY) => {
    const rect = img.getBoundingClientRect();
    const xFraction = (clientX - rect.left) / rect.width;
    const yFraction = (clientY - rect.top) / rect.height;
    if (xFraction < 0 || xFraction > 1 || yFraction < 0 || yFraction > 1) return;

    $all('.eyedropper-marker', wrap).forEach((m) => m.remove());
    const marker = document.createElement('div');
    marker.className = 'eyedropper-marker';
    marker.style.left = `${xFraction * 100}%`;
    marker.style.top = `${yFraction * 100}%`;
    wrap.appendChild(marker);

    const hex = await getPixelHexAt(dataUrl, xFraction, yFraction);
    picked = hex;
    preview.innerHTML = `<span class="swatch-big" style="background:${hex}"></span><span>${hex}</span>`;
    doneBtn.disabled = false;
  };

  img.addEventListener('click', (e) => pickAt(e.clientX, e.clientY));

  doneBtn.addEventListener('click', () => {
    if (!picked) return;
    closeSheet();
    onPick(picked);
  });
}

/* ===================== CREAR / EDITAR PRENDA (reutilizable) ===================== */
// Formulario reutilizable de creación/edición de prenda: puede pintarse tanto en el
// cajón de configuración como dentro de una hoja modal (al editar desde la Home).
async function paintPrendaForm({ container, editId = null, backIcon = '‹', onSaved, onCancel }) {
  const editing = !!editId;
  const original = editing ? await DB.getPrenda(editId) : null;

  const draft = editing
    ? { ...original }
    : {
        titulo: '',
        categoria: 'arriba',
        subtipo: SUBTIPOS.arriba[0],
        temporada: 'entretiempo',
        ocasion: 'casual',
        foto_original: null,
        foto_recortada: null,
        fotoMime: 'image/png',
        recorte_ia: true,
        color_principal: '',
        color_principal_hex: null,
        color_secundario: '',
        color_secundario_hex: null,
      };
  if (editing && draft.recorte_ia === undefined) draft.recorte_ia = true;
  if (editing && !draft.foto_original) draft.foto_original = draft.foto_recortada;

  let procesando = false;

  const runRecorteIA = async () => {
    if (!draft.foto_original) return;
    const { base64, mimeType } = dataUrlToBase64(draft.foto_original);
    if (!base64) return;
    procesando = true;
    paint();
    try {
      const resultado = await quitarFondoConGemini({ base64, mimeType });
      draft.foto_recortada = resultado;
      toast('Fondo recortado con IA');
    } catch (err) {
      toast(err.message || 'No se pudo recortar el fondo con IA', 'error');
      draft.foto_recortada = draft.foto_original;
    }
    procesando = false;
    paint();
  };

  const paint = () => {
    container.innerHTML = `
      <div class="screen-header" style="margin-bottom:14px;">
        <button class="back-btn" id="pf-back">${backIcon}</button>
        <div class="screen-title" style="font-size:20px;">${editing ? 'EDITAR PRENDA' : 'CREAR PRENDA'}</div>
      </div>

      <div class="field">
        <label>Foto</label>
        <div class="detail-photo ${procesando ? 'photo-processing' : ''}" id="foto-preview">
          ${
            procesando
              ? `<div class="processing-overlay"><div class="spinner"></div><span>Recortando con IA...</span></div>`
              : draft.foto_recortada
              ? `<img src="${draft.foto_recortada}" alt=""/>`
              : `<span style="color:var(--text-faint);font-size:13px;">Sin foto todavía</span>`
          }
        </div>
        <input type="file" id="foto-input" accept="image/*" class="hidden" />
        <button type="button" class="btn btn-outline btn-block" id="foto-elegir" ${procesando ? 'disabled' : ''}>${
      draft.foto_recortada ? 'Cambiar foto' : 'Elegir foto de la galería'
    }</button>
        ${switchHtml('sw-recorte-ia', draft.recorte_ia, 'Recorte IA', 'Al importar, Gemini quita el fondo automáticamente')}
      </div>

      <div class="field">
        <label>Título</label>
        <input type="text" id="p-titulo" placeholder="Ej: Camisa vaquera" value="${escapeHtml(draft.titulo)}" />
      </div>

      <div class="field">
        <label>Categoría</label>
        <div class="chip-select" data-field="categoria">
          ${CATEGORIAS.map((c) => `<button type="button" data-value="${c}" class="${draft.categoria === c ? 'active' : ''}">${CATEGORIA_LABEL[c]}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Subtipo</label>
        <div class="chip-select" id="p-subtipo-box">
          ${SUBTIPOS[draft.categoria].map((s) => `<button type="button" data-value="${s}" class="${draft.subtipo === s ? 'active' : ''}">${cap(s)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Temporada</label>
        ${chipSelectHtml('temporada', TEMPORADAS, draft.temporada)}
      </div>
      <div class="field">
        <label>Ocasión</label>
        ${chipSelectHtml('ocasion', OCASIONES, draft.ocasion)}
      </div>

      <div class="field">
        <label>Color principal</label>
        <input type="text" id="p-color1" placeholder="Ej: azul marino" value="${escapeHtml(draft.color_principal)}" />
        <div class="eyedropper-preview">
          ${draft.color_principal_hex ? `<span class="swatch-big" style="background:${draft.color_principal_hex}"></span><span>${draft.color_principal_hex}</span>` : `<span class="screen-sub" style="margin:0;">Sin color tomado con el pincel</span>`}
        </div>
        <button type="button" class="btn btn-outline btn-block" id="p-pick1" ${draft.foto_recortada ? '' : 'disabled'} style="margin-top:8px;">🖌️ Tomar color de la foto</button>
      </div>

      <div class="field">
        <label>Color secundario (opcional)</label>
        <input type="text" id="p-color2" placeholder="Ej: blanco" value="${escapeHtml(draft.color_secundario || '')}" />
        <div class="eyedropper-preview">
          ${draft.color_secundario_hex ? `<span class="swatch-big" style="background:${draft.color_secundario_hex}"></span><span>${draft.color_secundario_hex}</span>` : `<span class="screen-sub" style="margin:0;">Sin color tomado con el pincel</span>`}
        </div>
        <button type="button" class="btn btn-outline btn-block" id="p-pick2" ${draft.foto_recortada ? '' : 'disabled'} style="margin-top:8px;">🖌️ Tomar color de la foto</button>
      </div>

      <button class="btn btn-primary btn-block" id="p-guardar" style="margin-top:10px;" ${procesando ? 'disabled' : ''}>${editing ? 'Guardar cambios' : 'Guardar prenda'}</button>
    `;

    $('#pf-back', container).addEventListener('click', onCancel);
    $('#foto-elegir', container).addEventListener('click', () => $('#foto-input', container).click());
    $('#foto-input', container).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const { dataUrl } = await loadAndResizeImage(file);
        draft.foto_original = dataUrl;
        draft.foto_recortada = dataUrl;
        if (draft.recorte_ia) {
          await runRecorteIA();
        } else {
          paint();
        }
      } catch (err) {
        toast('No se pudo cargar la foto', 'error');
      }
    });
    $('#sw-recorte-ia', container).addEventListener('change', async (e) => {
      draft.recorte_ia = e.target.checked;
      if (!draft.foto_original) return;
      if (draft.recorte_ia) {
        await runRecorteIA();
      } else {
        draft.foto_recortada = draft.foto_original;
        paint();
      }
    });
    wireChipSelect(container, 'categoria', (v) => {
      draft.categoria = v;
      draft.subtipo = SUBTIPOS[v][0];
      paint();
    });
    $('#p-subtipo-box', container).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) {
        draft.subtipo = b.dataset.value;
        paint();
      }
    });
    wireChipSelect(container, 'temporada', (v) => (draft.temporada = v));
    wireChipSelect(container, 'ocasion', (v) => (draft.ocasion = v));
    $('#p-titulo', container).addEventListener('input', (e) => (draft.titulo = e.target.value));
    $('#p-color1', container).addEventListener('input', (e) => (draft.color_principal = e.target.value));
    $('#p-color2', container).addEventListener('input', (e) => (draft.color_secundario = e.target.value));

    if ($('#p-pick1', container)) {
      $('#p-pick1', container).addEventListener('click', () => {
        openEyedropper(draft.foto_recortada, (hex) => {
          draft.color_principal_hex = hex;
          paint();
        });
      });
    }
    if ($('#p-pick2', container)) {
      $('#p-pick2', container).addEventListener('click', () => {
        openEyedropper(draft.foto_recortada, (hex) => {
          draft.color_secundario_hex = hex;
          paint();
        });
      });
    }

    $('#p-guardar', container).addEventListener('click', async () => {
      if (!draft.titulo.trim()) return toast('Ponle un título a la prenda', 'error');
      if (!draft.foto_recortada) return toast('Añade una foto', 'error');
      if (!draft.color_principal || !draft.color_principal.trim()) return toast('Escribe el color principal', 'error');

      if (editing) {
        const actualizada = { ...original, ...draft };
        await DB.updatePrenda(actualizada);
        invalidatePrendasCache();
        toast('Prenda actualizada');
        onSaved(actualizada);
      } else {
        const nueva = {
          id: uid(),
          ...draft,
          fecha_anadida: todayStr(),
          ultima_vez_usada: null,
          veces_usada: 0,
          activa: true,
        };
        await DB.addPrenda(nueva);
        invalidatePrendasCache();
        toast('Prenda añadida al vestidor');
        onSaved(nueva);
      }
    });
  };
  paint();
}

/* ===================== SETTINGS DRAWER ===================== */
const drawer = document.getElementById('settings-drawer');
const drawerContent = document.getElementById('drawer-content');

function openDrawer() {
  drawer.classList.remove('hidden');
  renderDrawerMenu();
}
function closeDrawer() {
  drawer.classList.add('hidden');
}

function renderDrawerMenu() {
  drawerContent.innerHTML = `
    <button class="settings-item" data-go="wardrobe">Modificar vestidor <span class="arrow">›</span></button>
    <button class="settings-item" data-go="crear">Crear prenda <span class="arrow">›</span></button>
    <button class="settings-item" data-go="gemini">Configuración de Gemini <span class="arrow">›</span></button>
    <button class="settings-item" data-go="backup">Copia de seguridad <span class="arrow">›</span></button>
  `;
  $('[data-go="wardrobe"]', drawerContent).addEventListener('click', () => renderWardrobeGrid());
  $('[data-go="crear"]', drawerContent).addEventListener('click', () =>
    paintPrendaForm({
      container: drawerContent,
      editId: null,
      onSaved: () => renderWardrobeGrid(),
      onCancel: () => renderDrawerMenu(),
    })
  );
  $('[data-go="gemini"]', drawerContent).addEventListener('click', () => renderGeminiConfig());
  $('[data-go="backup"]', drawerContent).addEventListener('click', () => renderBackupPanel());
}

function drawerHeaderHtml(title) {
  return `<div class="screen-header" style="margin-bottom:14px;">
    <button class="back-btn" id="drawer-sub-back">‹</button>
    <div class="screen-title" style="font-size:20px;">${title}</div>
  </div>`;
}

async function renderWardrobeGrid() {
  let query = '';
  let catFiltro = null;
  let temporadaFiltro = null;
  let ocasionFiltro = null;

  const paint = async () => {
    const prendas = (await getPrendas(true)).filter((p) => p.activa);
    const filtradas = prendas.filter((p) => {
      if (catFiltro && p.categoria !== catFiltro) return false;
      if (temporadaFiltro && p.temporada !== temporadaFiltro) return false;
      if (ocasionFiltro && p.ocasion !== ocasionFiltro) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!(p.titulo.toLowerCase().includes(q) || p.subtipo.toLowerCase().includes(q) || (p.color_principal || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });

    drawerContent.innerHTML = `
      ${drawerHeaderHtml('VESTIDOR')}
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" id="w-search" placeholder="Buscar por título, subtipo o color..." value="${escapeHtml(query)}" />
      </div>
      <div class="chip-select" id="w-cat" style="margin-bottom:8px;">
        <button type="button" data-value="" class="${!catFiltro ? 'active' : ''}">Todas</button>
        ${CATEGORIAS.map((c) => `<button type="button" data-value="${c}" class="${catFiltro === c ? 'active' : ''}">${CATEGORIA_LABEL[c]}</button>`).join('')}
      </div>
      <div class="chip-select" id="w-temp" style="margin-bottom:8px;">
        <button type="button" data-value="" class="${!temporadaFiltro ? 'active' : ''}">Toda temporada</button>
        ${TEMPORADAS.map((t) => `<button type="button" data-value="${t}" class="${temporadaFiltro === t ? 'active' : ''}">${cap(t)}</button>`).join('')}
      </div>
      <div class="chip-select" id="w-oca" style="margin-bottom:16px;">
        <button type="button" data-value="" class="${!ocasionFiltro ? 'active' : ''}">Toda ocasión</button>
        ${OCASIONES.map((o) => `<button type="button" data-value="${o}" class="${ocasionFiltro === o ? 'active' : ''}">${cap(o)}</button>`).join('')}
      </div>
      <div class="garment-grid">
        ${
          filtradas.length
            ? filtradas
                .map(
                  (p) => `<button type="button" class="garment-card" data-id="${p.id}">
              <div class="thumb"><img src="${p.foto_recortada}" alt=""/></div>
              <div class="cap"><div class="t">${escapeHtml(p.titulo)}</div><div class="c">${escapeHtml(p.subtipo)}</div></div>
            </button>`
                )
                .join('')
            : `<div class="garment-empty">No se encontraron prendas</div>`
        }
      </div>
    `;
    $('#drawer-sub-back').addEventListener('click', renderDrawerMenu);
    $('#w-search').addEventListener('input', (e) => {
      query = e.target.value;
      keepFocus = true;
      paint();
    });
    $('#w-cat').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) {
        catFiltro = b.dataset.value || null;
        paint();
      }
    });
    $('#w-temp').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) {
        temporadaFiltro = b.dataset.value || null;
        paint();
      }
    });
    $('#w-oca').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) {
        ocasionFiltro = b.dataset.value || null;
        paint();
      }
    });
    $all('.garment-card', drawerContent).forEach((c) => {
      c.addEventListener('click', () => renderPrendaDetail(c.dataset.id));
    });
    if (keepFocus) refocus($('#w-search'));
  };
  let keepFocus = false;
  paint();
}

function renderPrendaDetail(id) {
  paintFicha({
    container: drawerContent,
    id,
    allowDelete: true,
    backIcon: '‹',
    onBack: renderWardrobeGrid,
    onEdit: () =>
      paintPrendaForm({
        container: drawerContent,
        editId: id,
        onSaved: () => renderPrendaDetail(id),
        onCancel: () => renderPrendaDetail(id),
      }),
    onDeleted: renderWardrobeGrid,
  });
}

async function renderGeminiConfig() {
  const apiKey = (await DB.getConfig('gemini_api_key')) || '';
  const model = (await DB.getConfig('gemini_model')) || 'gemini-1.5-flash';
  const imageModel = (await DB.getConfig('gemini_image_model')) || 'gemini-3.1-flash-image';
  const dias = (await DB.getConfig('dias_no_repetir')) ?? 14;

  drawerContent.innerHTML = `
    ${drawerHeaderHtml('GEMINI')}
    <div class="field">
      <label>API key de Gemini</label>
      <input type="password" id="g-apikey" placeholder="Pega aquí tu API key" value="${escapeHtml(apiKey)}" />
    </div>
    <div class="field">
      <label>Modelo (generar outfit)</label>
      <input type="text" id="g-model" value="${escapeHtml(model)}" />
    </div>
    <div class="field">
      <label>Modelo (recorte de imagen IA)</label>
      <input type="text" id="g-image-model" value="${escapeHtml(imageModel)}" />
    </div>
    <div class="field">
      <label>Días sin repetir prenda</label>
      <input type="number" id="g-dias" min="0" value="${dias}" />
    </div>
    <button class="btn btn-primary btn-block" id="g-guardar">Guardar</button>
    <div class="screen-sub" style="margin-top:14px;">La API key se guarda solo en este dispositivo, nunca en el código de la app.</div>
  `;
  $('#drawer-sub-back').addEventListener('click', renderDrawerMenu);
  $('#g-guardar').addEventListener('click', async () => {
    await DB.setConfig('gemini_api_key', $('#g-apikey').value.trim());
    await DB.setConfig('gemini_model', $('#g-model').value.trim() || 'gemini-1.5-flash');
    await DB.setConfig('gemini_image_model', $('#g-image-model').value.trim() || 'gemini-3.1-flash-image');
    await DB.setConfig('dias_no_repetir', parseInt($('#g-dias').value, 10) || 0);
    toast('Configuración guardada');
  });
}

function renderBackupPanel() {
  drawerContent.innerHTML = `
    ${drawerHeaderHtml('COPIA DE SEGURIDAD')}
    <div class="screen-sub">Safari puede borrar los datos de una PWA que lleve tiempo sin usarse. Exporta una copia de vez en cuando para no perder tu vestidor.</div>
    <button class="btn btn-primary btn-block" id="b-export" style="margin-bottom:12px;">Exportar datos</button>
    <input type="file" id="b-import-input" accept="application/json" class="hidden" />
    <button class="btn btn-outline btn-block" id="b-import">Importar datos</button>
  `;
  $('#drawer-sub-back').addEventListener('click', renderDrawerMenu);
  $('#b-export').addEventListener('click', async () => {
    await exportarDatos();
    toast('Copia de seguridad descargada');
  });
  $('#b-import').addEventListener('click', () => $('#b-import-input').click());
  $('#b-import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importarDatos(file);
      invalidatePrendasCache();
      await reconcilePastOutfits();
      toast('Datos importados correctamente');
      renderDrawerMenu();
    } catch (err) {
      toast(err.message || 'No se pudo importar el archivo', 'error');
    }
  });
}

/* ===================== INIT ===================== */
function wireGlobalEvents() {
  document.getElementById('btn-open-settings').addEventListener('click', openDrawer);
  document.getElementById('btn-close-settings').addEventListener('click', closeDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch (e) {
    /* silencioso */
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

async function init() {
  wireGlobalEvents();
  await reconcilePastOutfits();
  await renderHome();
  requestPersistentStorage();
  registerServiceWorker();
}

init();

// gemini.js — llamadas a la API de Gemini: generación de outfit + recorte de fondo por IA
import { DB } from './db.js';

const DEFAULT_TEXT_MODEL = 'gemini-1.5-flash';
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

function buildPrompt({ fecha, ocasion, temporada, ciudad, comentarios, candidatos }) {
  const listado = candidatos
    .map(
      (p) =>
        `- id: ${p.id} | categoria: ${p.categoria} | subtipo: ${p.subtipo} | color_principal: ${p.color_principal}` +
        `${p.color_secundario ? ' | color_secundario: ' + p.color_secundario : ''} | temporada: ${p.temporada} | ocasion: ${p.ocasion} | titulo: ${p.titulo}`
    )
    .join('\n');

  return `Eres el estilista personal de una app de armario. Tu tarea es elegir UN outfit
completo (una prenda de arriba, una de abajo y un calzado) a partir de las
prendas candidatas que te doy, cada una acompañada de sus metadatos.

Contexto del día:
- Fecha: ${fecha}
- Ocasión: ${ocasion}
- Temporada: ${temporada}
- Ciudad: ${ciudad || 'no especificada'}
- Comentarios: ${comentarios || 'ninguno'}

Reglas de elección:
1. Elige exactamente una prenda de categoría "arriba", una de "abajo" y una de "calzado".
2. Prioriza combinaciones de color armoniosas y coherentes con la ocasión y temporada indicada, así como con el clima que va a hacer en esa fecha en la ciudad indicada. Ten en cuenta también los posibles comentarios.
3. Elige solo entre los IDs de esta lista de prendas candidatas (no inventes IDs):
${listado}

Responde únicamente con el outfit elegido y una razón breve, siguiendo el siguiente JSON:
{
  "prenda_arriba_id": "...",
  "prenda_abajo_id": "...",
  "prenda_calzado_id": "...",
  "razonamiento": "breve explicación de la combinación elegida"
}
Debe ser explícitamente salida JSON estricta (sin texto extra) para poder parsear la respuesta sin fricción.`;
}

async function callGemini(model, body) {
  const apiKey = await DB.getConfig('gemini_api_key');
  if (!apiKey) {
    throw new Error('No hay ninguna API key de Gemini configurada. Ve a Configuración > Gemini.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('No se pudo conectar con Gemini (revisa tu conexión a internet).');
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('La API key de Gemini no es válida.');
  }
  if (res.status === 429) {
    throw new Error('Se ha alcanzado el límite de peticiones a Gemini (rate limit). Inténtalo de nuevo en un momento.');
  }
  if (!res.ok) {
    let detalle = '';
    try {
      const errJson = await res.json();
      detalle = errJson?.error?.message ? `: ${errJson.error.message}` : '';
    } catch (e) {
      /* ignore */
    }
    throw new Error(`Gemini devolvió un error (${res.status})${detalle}.`);
  }
  return res.json();
}

export async function generarOutfitConGemini({ fecha, ocasion, temporada, ciudad, comentarios, candidatos }) {
  const model = (await DB.getConfig('gemini_model')) || DEFAULT_TEXT_MODEL;
  const prompt = buildPrompt({ fecha, ocasion, temporada, ciudad, comentarios, candidatos });

  const data = await callGemini(model, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
  });

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  let parsed;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error('La respuesta de Gemini no se pudo interpretar como JSON.');
  }

  const ids = candidatos.map((c) => c.id);
  if (
    !parsed.prenda_arriba_id ||
    !parsed.prenda_abajo_id ||
    !parsed.prenda_calzado_id ||
    !ids.includes(parsed.prenda_arriba_id) ||
    !ids.includes(parsed.prenda_abajo_id) ||
    !ids.includes(parsed.prenda_calzado_id)
  ) {
    throw new Error('Gemini eligió prendas fuera de la lista de candidatas.');
  }

  return parsed;
}

/**
 * Envía una foto a Gemini pidiéndole que quite el fondo y devuelve la imagen
 * generada como dataURL. Se usa desde el interruptor "Recorte IA" al crear una prenda.
 */
export async function quitarFondoConGemini({ base64, mimeType }) {
  const model = (await DB.getConfig('gemini_image_model')) || DEFAULT_IMAGE_MODEL;

  const data = await callGemini(model, {
    contents: [
      {
        parts: [{ text: 'Quita el fondo de la siguiente imagen' }, { inlineData: { mimeType, data: base64 } }],
      },
    ],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);
  if (!imgPart) {
    throw new Error('Gemini no devolvió ninguna imagen recortada.');
  }
  const inline = imgPart.inlineData || imgPart.inline_data;
  const outMime = inline.mimeType || inline.mime_type || 'image/png';
  const outData = inline.data;
  return `data:${outMime};base64,${outData}`;
}

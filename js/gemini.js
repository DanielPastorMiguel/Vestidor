// gemini.js — llamada a la API de Gemini para generar un outfit
import { DB } from './db.js';

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

export async function generarOutfitConGemini({ fecha, ocasion, temporada, ciudad, comentarios, candidatos }) {
  const apiKey = await DB.getConfig('gemini_api_key');
  if (!apiKey) {
    throw new Error('No hay ninguna API key de Gemini configurada. Ve a Configuración > Gemini.');
  }
  const model = (await DB.getConfig('gemini_model')) || 'gemini-2.0-flash';
  const prompt = buildPrompt({ fecha, ocasion, temporada, ciudad, comentarios, candidatos });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }),
    });
  } catch (e) {
    throw new Error('No se pudo conectar con Gemini (revisa tu conexión a internet).');
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('La API key de Gemini no es válida.');
  }
  if (res.status === 429) {
    throw new Error('Se ha alcanzado el límite de peticiones a Gemini (rate limit). Inténtalo más tarde.');
  }
  if (!res.ok) {
    throw new Error(`Gemini devolvió un error (${res.status}).`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
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

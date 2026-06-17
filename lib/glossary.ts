import { Word } from './store';

// Glosario de correcciones para la transcripción.
// Whisper suele equivocarse con términos técnicos y nombres propios.
// La clave es lo que Whisper escribe MAL (en minúsculas), el valor es la forma correcta.
const DEFAULT_GLOSSARY: Record<string, string> = {
  'cloud code': 'Claude Code',
  'cloud.md': 'Claude.md',
  'cloud': 'Claude',          // ojo: solo cuando aparece sola; ver lógica abajo
  'claude.md': 'Claude.md',
  'enbroche': 'en broche',
  'eneitch': 'n8n',
  'eneite': 'n8n',
  'n ocho n': 'n8n',
  'en ocho ene': 'n8n',
  'tiendanube': 'Tiendanube',
  'mercado pago': 'Mercado Pago',
  'afip': 'AFIP',
  'anthropic': 'Anthropic',
  'chatgpt': 'ChatGPT',
  'whatsapp': 'WhatsApp',
  'instagram': 'Instagram',
  'tiktok': 'TikTok',
  'youtube': 'YouTube',
  'linkedin': 'LinkedIn',
};

// Términos "peligrosos" que solo se corrigen si están solos (no dentro de otra palabra)
const STANDALONE_ONLY = new Set(['cloud']);

export type GlossaryEntry = { wrong: string; right: string };

// Aplica el glosario a la transcripción completa (texto plano)
export function correctTranscript(text: string, extra: GlossaryEntry[] = []): string {
  let result = text;
  const all = { ...DEFAULT_GLOSSARY };
  for (const e of extra) {
    if (e.wrong?.trim()) all[e.wrong.toLowerCase().trim()] = e.right;
  }
  for (const [wrong, right] of Object.entries(all)) {
    // \b para límites de palabra, insensible a mayúsculas
    const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(re, right);
  }
  return result;
}

// Aplica el glosario palabra por palabra (para los subtítulos karaoke).
// Maneja términos de una y de varias palabras.
export function correctWords(words: Word[], extra: GlossaryEntry[] = []): Word[] {
  const all = { ...DEFAULT_GLOSSARY };
  for (const e of extra) {
    if (e.wrong?.trim()) all[e.wrong.toLowerCase().trim()] = e.right;
  }

  // Separar términos de 1 palabra vs multi-palabra
  const singleWord: Record<string, string> = {};
  const multiWord: Array<{ parts: string[]; right: string }> = [];
  for (const [wrong, right] of Object.entries(all)) {
    const parts = wrong.split(/\s+/);
    if (parts.length === 1) singleWord[wrong] = right;
    else multiWord.push({ parts, right });
  }

  const out: Word[] = words.map((w) => ({ ...w }));

  // Correcciones de 1 palabra
  for (const w of out) {
    const clean = w.word.trim().toLowerCase().replace(/[.,!?;:]$/, '');
    if (singleWord[clean]) {
      if (STANDALONE_ONLY.has(clean) && clean === 'cloud') {
        // "cloud" → "Claude" solo si no es parte de "cloud code" etc. (se maneja en multiword)
        w.word = w.word.replace(/cloud/gi, 'Claude');
      } else {
        // Preservar puntuación final
        const punct = w.word.match(/[.,!?;:]$/)?.[0] || '';
        w.word = singleWord[clean] + punct;
      }
    }
  }

  // Correcciones multi-palabra: buscar secuencias consecutivas
  for (const { parts, right } of multiWord) {
    for (let i = 0; i <= out.length - parts.length; i++) {
      let match = true;
      for (let j = 0; j < parts.length; j++) {
        const clean = out[i + j].word.trim().toLowerCase().replace(/[.,!?;:]$/, '');
        if (clean !== parts[j]) { match = false; break; }
      }
      if (match) {
        // Reemplazar: la primera palabra toma todo el término corregido, las demás quedan vacías
        const rightParts = right.split(/\s+/);
        for (let j = 0; j < parts.length; j++) {
          out[i + j].word = rightParts[j] || '';
        }
      }
    }
  }

  // Filtrar palabras vacías que quedaron del merge
  return out.filter((w) => w.word.trim() !== '');
}

import { Word, Analysis } from './store';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

export async function analyzeTranscript(
  words: Word[],
  transcript: string,
  duration: number,
  brief: string
): Promise<Analysis> {
  // Transcripción con marcas de tiempo cada ~10 palabras para que Claude ubique los cortes
  let timed = '';
  for (let i = 0; i < words.length; i++) {
    if (i % 10 === 0) timed += `\n[${words[i].start.toFixed(1)}s] `;
    timed += words[i].word + ' ';
  }

  const system = `Sos un editor de video senior especializado en contenido para redes (TikTok, Reels, Shorts, YouTube, LinkedIn) para el mercado argentino. Tu trabajo: analizar la transcripción de un video crudo y devolver un plan de edición. Respondé ÚNICAMENTE con JSON válido, sin markdown, sin backticks, sin texto extra.`;

  const user = `Video de ${duration.toFixed(1)} segundos. Transcripción con timestamps:
${timed}

${brief ? `Instrucciones y ganchos del usuario (priorizalas):\n${brief}\n` : ''}
Devolvé este JSON exacto:
{
  "cortes": [{"start": 12.3, "end": 14.1, "razon": "silencio largo"}],
  "hooks": ["5 ganchos alternativos para los primeros 3 segundos, en español argentino con voseo"],
  "captions": {
    "tiktok": "caption con hashtags",
    "instagram": "caption para reel",
    "youtube": "título + descripción corta",
    "linkedin": "post profesional pero cercano"
  },
  "resumen": "1-2 frases sobre el potencial del video y qué mejorarías"
}

Reglas para los cortes:
- Marcá silencios mayores a 1 segundo, muletillas (eh, este, o sea sueltos), arranques en falso y repeticiones.
- Usá los timestamps reales de la transcripción. No inventes tiempos.
- No cortes contenido con valor. Ante la duda, no cortes.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error de Claude API: ${res.status} ${err}`);
  }

  const data = await res.json();
  const text = data.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();

  return JSON.parse(text) as Analysis;
}

export async function findClips(
  words: Word[],
  duration: number,
  brief: string
): Promise<import('./store').Clip[]> {
  let timed = '';
  for (let i = 0; i < words.length; i++) {
    if (i % 10 === 0) timed += `\n[${words[i].start.toFixed(1)}s] `;
    timed += words[i].word + ' ';
  }

  const system = `Sos un editor experto en convertir videos largos de YouTube en clips virales para Shorts, Reels y TikTok (mercado argentino). Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto extra.`;

  const user = `Video de ${(duration / 60).toFixed(1)} minutos. Transcripción con timestamps:
${timed}

${brief ? `Instrucciones del usuario (priorizalas):\n${brief}\n` : ''}
Encontrá los mejores momentos para clips verticales y devolvé este JSON exacto:
{
  "clips": [
    {
      "start": 124.5,
      "end": 168.2,
      "titulo": "título corto y punchy para identificar el clip",
      "hook": "la primera frase que se escucha en el clip",
      "razon": "por qué este momento tiene potencial viral"
    }
  ]
}

Reglas:
- Entre 3 y 6 clips, de 20 a 75 segundos cada uno.
- Cada clip tiene que ser autocontenido: se entiende sin ver el resto del video.
- El inicio del clip tiene que funcionar como hook: una afirmación fuerte, una pregunta o un dato que frene el scroll.
- Empezá y terminá en límites de frase (usá los timestamps reales, no inventes).
- Priorizá: consejos accionables, datos sorprendentes, opiniones polémicas, historias con remate.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) throw new Error(`Error de Claude API: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const text = data.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();

  return (JSON.parse(text).clips || []) as import('./store').Clip[];
}

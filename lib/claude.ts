import { Word, Analysis, Clip, Cut, Zoom } from './store';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// Máximo de palabras por chunk (~10 minutos de video)
const WORDS_PER_CHUNK = 1500;

function buildTimedTranscript(words: Word[]): string {
  let timed = '';
  for (let i = 0; i < words.length; i++) {
    if (i % 10 === 0) timed += `\n[${words[i].start.toFixed(1)}s] `;
    timed += words[i].word + ' ';
  }
  return timed.trim();
}

function chunkWords(words: Word[], chunkSize: number): Word[][] {
  const chunks: Word[][] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize));
  }
  return chunks;
}

async function callClaude(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error de Claude API: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();
}

function safeParseJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Intentar extraer JSON del texto
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    // Intentar reparar JSON truncado
    const start = text.indexOf('{');
    if (start !== -1) {
      let json = text.slice(start);
      const open = (json.match(/\{/g) || []).length;
      const close = (json.match(/\}/g) || []).length;
      if (open > close) {
        json += '}'.repeat(open - close);
        try { return JSON.parse(json); } catch {}
      }
    }
    throw new Error('JSON inválido: ' + text.slice(0, 200));
  }
}

export async function analyzeTranscript(
  words: Word[],
  transcript: string,
  duration: number,
  brief: string
): Promise<Analysis> {
  const system = `Sos un editor de video senior especializado en contenido para redes y YouTube para el mercado argentino. Respondé ÚNICAMENTE con JSON válido, sin markdown, sin backticks, sin texto extra.`;

  const chunks = chunkWords(words, WORDS_PER_CHUNK);
  const totalChunks = chunks.length;

  // Si el video es corto (1 chunk), procesarlo directo
  if (totalChunks === 1) {
    const timed = buildTimedTranscript(words);
    const user = `Video de ${(duration/60).toFixed(1)} minutos. Transcripción con timestamps:\n${timed}\n\n${brief ? `Instrucciones del usuario:\n${brief}\n\n` : ''}Devolvé este JSON:\n{"cortes":[{"start":12.3,"end":14.1,"razon":"silencio largo"}],"zooms":[{"start":30.0,"end":34.0,"scale":1.3,"razon":"momento de énfasis"}],"hooks":["gancho 1","gancho 2","gancho 3","gancho 4","gancho 5"],"captions":{"tiktok":"caption con hashtags","instagram":"caption para reel","youtube":"título + descripción","linkedin":"post profesional"},"resumen":"1-2 frases sobre el potencial"}\n\nReglas cortes: silencios >1s, muletillas (eh, este, o sea), arranques en falso, repeticiones. Máximo 40 cortes. No inventes timestamps.\n\nReglas zooms: marcá 3-8 momentos donde el speaker dice algo IMPORTANTE (un dato clave, una afirmación fuerte, el remate de una idea, una pregunta retórica). El zoom hace que el video se sienta dinámico. Cada zoom dura 2-5 segundos, scale entre 1.2 y 1.4. No pongas zooms encima de los cortes. Usá timestamps reales.`;

    const text = await callClaude(system, user);
    return safeParseJSON(text) as Analysis;
  }

  // Video largo: procesar en chunks para los cortes
  console.log(`Video largo: procesando ${totalChunks} chunks de ${WORDS_PER_CHUNK} palabras`);

  const allCortes: Analysis['cortes'] = [];
  const allZooms: NonNullable<Analysis['zooms']> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const timed = buildTimedTranscript(chunk);
    const chunkStart = chunk[0].start.toFixed(1);
    const chunkEnd = chunk[chunk.length - 1].end.toFixed(1);

    console.log(`Procesando chunk ${i + 1}/${totalChunks} (${chunkStart}s - ${chunkEnd}s)`);

    const user = `Parte ${i + 1} de ${totalChunks} del video (${chunkStart}s a ${chunkEnd}s de un video de ${(duration/60).toFixed(1)} minutos total).\n\nTranscripción con timestamps:\n${timed}\n\nIdentificá los cortes de edición Y los momentos de zoom en esta sección. Devolvé este JSON:\n{"cortes":[{"start":12.3,"end":14.1,"razon":"silencio largo"}],"zooms":[{"start":30.0,"end":34.0,"scale":1.3,"razon":"momento de énfasis"}]}\n\nReglas cortes: silencios >1s, muletillas (eh, este, o sea sueltos), arranques en falso, repeticiones. Máximo 15 cortes por chunk.\nReglas zooms: marcá 1-3 momentos por chunk donde el speaker dice algo IMPORTANTE (dato clave, afirmación fuerte, remate). Duración 2-5s, scale entre 1.2 y 1.4. No encima de los cortes.\n\nUsá SOLO timestamps que aparecen en esta transcripción.`;

    try {
      const text = await callClaude(system, user);
      const parsed = safeParseJSON(text);
      if (parsed.cortes && Array.isArray(parsed.cortes)) {
        allCortes.push(...parsed.cortes);
      }
      if (parsed.zooms && Array.isArray(parsed.zooms)) {
        allZooms.push(...parsed.zooms);
      }
    } catch (e) {
      console.error(`Error en chunk ${i + 1}:`, e);
      // Continuar con el siguiente chunk aunque uno falle
    }
  }

  // Ahora generar hooks, captions y resumen con un resumen del video completo
  // Usamos solo el inicio, medio y fin para el contexto
  const firstChunk = buildTimedTranscript(chunks[0]);
  const midChunk = buildTimedTranscript(chunks[Math.floor(chunks.length / 2)]);
  const lastChunk = buildTimedTranscript(chunks[chunks.length - 1]);

  const summaryContext = `INICIO DEL VIDEO:\n${firstChunk.slice(0, 2000)}\n\n...\n\nMITAD DEL VIDEO:\n${midChunk.slice(0, 2000)}\n\n...\n\nFINAL DEL VIDEO:\n${lastChunk.slice(-2000)}`;

  const summaryUser = `Video de YouTube de ${(duration/60).toFixed(1)} minutos.\n\nFragmentos del video para contexto:\n${summaryContext}\n\n${brief ? `Instrucciones del usuario:\n${brief}\n\n` : ''}Generá hooks, captions y resumen. Devolvé este JSON:\n{"hooks":["gancho 1","gancho 2","gancho 3","gancho 4","gancho 5"],"captions":{"tiktok":"caption con hashtags","instagram":"caption para reel","youtube":"título + descripción larga para SEO","linkedin":"post profesional pero cercano"},"resumen":"2-3 frases sobre el potencial del video, los mejores momentos y qué mejorarías"}\n\nLos hooks son para los primeros 3 segundos de clips cortos, en español argentino con voseo.`;

  const summaryText = await callClaude(system, summaryUser);
  const summaryParsed = safeParseJSON(summaryText);

  return {
    cortes: allCortes,
    zooms: allZooms,
    hooks: summaryParsed.hooks || [],
    captions: summaryParsed.captions || {},
    resumen: summaryParsed.resumen || '',
  };
}

export async function findClips(
  words: Word[],
  duration: number,
  brief: string
): Promise<Clip[]> {
  const system = `Sos un editor experto en convertir videos largos de YouTube en clips virales para Shorts, Reels y TikTok (mercado argentino). Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto extra.`;

  const chunks = chunkWords(words, WORDS_PER_CHUNK);
  const allClips: Clip[] = [];

  // Para videos cortos, un solo llamado
  if (chunks.length === 1) {
    const timed = buildTimedTranscript(words);
    const user = `Video de ${(duration/60).toFixed(1)} minutos.\n\nTranscripción:\n${timed}\n\n${brief ? `Instrucciones:\n${brief}\n\n` : ''}Encontrá los mejores momentos para clips virales. JSON:\n{"clips":[{"start":124.5,"end":168.2,"titulo":"título punchy","hook":"primera frase del clip","razon":"por qué tiene potencial viral"}]}\n\nReglas: 3-6 clips, 20-75 segundos cada uno, autocontenidos, con hook fuerte al inicio.`;
    const text = await callClaude(system, user);
    const parsed = safeParseJSON(text);
    return (parsed.clips || []) as Clip[];
  }

  // Video largo: analizar cada chunk
  console.log(`Buscando clips en ${chunks.length} chunks`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const timed = buildTimedTranscript(chunk);
    const chunkStart = chunk[0].start.toFixed(1);
    const chunkEnd = chunk[chunk.length - 1].end.toFixed(1);

    const user = `Parte ${i + 1} de ${chunks.length} de un video de ${(duration/60).toFixed(1)} minutos (sección ${chunkStart}s - ${chunkEnd}s).\n\nTranscripción:\n${timed}\n\n${brief ? `Instrucciones:\n${brief}\n\n` : ''}¿Hay momentos virales en esta sección? Si no hay, devolvé {"clips":[]}. Si hay, máximo 2 clips por chunk.\n\nJSON:\n{"clips":[{"start":124.5,"end":168.2,"titulo":"título punchy","hook":"primera frase del clip","razon":"por qué tiene potencial viral"}]}\n\nReglas: 20-75 segundos, autocontenido, hook fuerte al inicio. Usá timestamps reales de esta sección.`;

    try {
      const text = await callClaude(system, user);
      const parsed = safeParseJSON(text);
      if (parsed.clips && Array.isArray(parsed.clips)) {
        allClips.push(...parsed.clips);
      }
    } catch (e) {
      console.error(`Error en chunk ${i + 1}:`, e);
    }
  }

  // Ordenar por start y limitar a los mejores 8
  return allClips
    .sort((a, b) => a.start - b.start)
    .slice(0, 8);
}

// ─── FASE 3: edición conversacional ───

export type EditAction =
  | { tipo: 'agregar_corte'; start: number; end: number; razon: string }
  | { tipo: 'quitar_corte'; index: number }
  | { tipo: 'ajustar_corte'; index: number; start: number; end: number }
  | { tipo: 'agregar_zoom'; start: number; end: number; scale: number; razon: string }
  | { tipo: 'quitar_zoom'; index: number }
  | { tipo: 'set_color'; color: string }
  | { tipo: 'set_encuadre'; framing: 'auto' | 'left' | 'center' | 'right' }
  | { tipo: 'set_formato'; platform: 'vertical' | 'horizontal' };

export type ChatEditResult = {
  respuesta: string; // mensaje en lenguaje natural para el usuario
  acciones: EditAction[];
};

type EditContext = {
  duration: number;
  cortes: Cut[];
  zooms: Zoom[];
  color: string;
  framing: string;
  platform: string;
  words: Word[];
};

export async function editWithChat(
  instruccion: string,
  ctx: EditContext,
  historial: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<ChatEditResult> {
  // Damos a la IA una transcripción liviana con timestamps para que pueda ubicar momentos
  const timed = buildTimedTranscript(ctx.words).slice(0, 30000);

  const cortesStr = ctx.cortes.map((c, i) => `  [${i}] ${c.start.toFixed(1)}s-${c.end.toFixed(1)}s: ${c.razon}`).join('\n') || '  (ninguno)';
  const zoomsStr = ctx.zooms.map((z, i) => `  [${i}] ${z.start.toFixed(1)}s-${z.end.toFixed(1)}s x${z.scale}: ${z.razon}`).join('\n') || '  (ninguno)';

  const system = `Sos el asistente de edición de ZW Clipper. El usuario te habla en español argentino (voseo) y te pide cambios sobre la edición de su video. Tu trabajo es interpretar el pedido y devolver acciones estructuradas que la app aplica automáticamente.

Respondé ÚNICAMENTE con JSON válido, sin markdown ni backticks, con esta forma:
{"respuesta":"mensaje corto y directo al usuario explicando qué hiciste","acciones":[...]}

Tipos de acciones disponibles:
- {"tipo":"agregar_corte","start":12.3,"end":14.1,"razon":"..."} — elimina ese tramo
- {"tipo":"quitar_corte","index":2} — reactiva/elimina el corte número 2 de la lista
- {"tipo":"ajustar_corte","index":1,"start":10.0,"end":12.5} — cambia los tiempos del corte 1
- {"tipo":"agregar_zoom","start":30.0,"end":34.0,"scale":1.3,"razon":"..."} — zoom en ese tramo
- {"tipo":"quitar_zoom","index":0} — saca el zoom número 0
- {"tipo":"set_color","color":"#FF0000"} — color de resaltado de subtítulos
- {"tipo":"set_encuadre","framing":"auto"} — auto, left, center o right
- {"tipo":"set_formato","platform":"vertical"} — vertical (9:16) u horizontal (16:9)

Reglas:
- Usá los timestamps reales de la transcripción para ubicar momentos. Si el usuario dice "el minuto 3", son 180 segundos.
- Si el pedido es ambiguo o no podés ubicarlo, devolvé acciones vacías y pedí aclaración en "respuesta".
- Si el usuario solo pregunta algo (no pide un cambio), respondé en "respuesta" con acciones vacías.
- scale de zoom entre 1.2 y 1.5. Colores en hex.
- Sé conciso y directo en "respuesta", como un editor compañero de laburo.`;

  const user = `Estado actual de la edición:
- Duración del video: ${ctx.duration.toFixed(1)}s (${(ctx.duration/60).toFixed(1)} min)
- Formato: ${ctx.platform}
- Encuadre: ${ctx.framing}
- Color resaltado: ${ctx.color}

Cortes actuales:
${cortesStr}

Zooms actuales:
${zoomsStr}

Transcripción con timestamps (para ubicar momentos):
${timed}

Pedido del usuario: "${instruccion}"`;

  const messages = [
    ...historial.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: user },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages,
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

  const parsed = safeParseJSON(text);
  return {
    respuesta: parsed.respuesta || 'Listo.',
    acciones: Array.isArray(parsed.acciones) ? parsed.acciones : [],
  };
}

import { Word } from './store';

// Convierte segundos a formato ASS h:mm:ss.cc
function ts(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// Convierte #RRGGBB a formato ASS &HBBGGRR
function assColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = c.slice(0, 2), g = c.slice(2, 4), b = c.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

type AssOptions = {
  width: number;
  height: number;
  highlightColor: string; // color al que "se pinta" cada palabra al decirse
  fontSize?: number;
  marginV?: number;
  maxWordsPerLine?: number;
};

/**
 * Genera un archivo .ass con subtítulos estilo karaoke:
 * grupos de 3-4 palabras, cada palabra se resalta al ser pronunciada.
 */
export function buildKaraokeAss(words: Word[], opts: AssOptions): string {
  const fontSize = opts.fontSize ?? Math.round(opts.height * 0.045);
  const marginV = opts.marginV ?? Math.round(opts.height * 0.22);
  const maxWords = opts.maxWordsPerLine ?? 4;
  const primary = assColor(opts.highlightColor); // palabra ya dicha
  const secondary = '&H00FFFFFF'; // palabra por decir (blanco)

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${opts.width}
PlayResY: ${opts.height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Liberation Sans,${fontSize},${primary},${secondary},&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,${Math.max(2, Math.round(fontSize * 0.08))},1,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk: Word[] = [];
    const chunkStart = words[i].start;
    while (
      i < words.length &&
      chunk.length < maxWords &&
      words[i].start - chunkStart < 2.2 &&
      // cortar línea si hay un silencio largo entre palabras
      (chunk.length === 0 || words[i].start - chunk[chunk.length - 1].end < 0.8)
    ) {
      chunk.push(words[i]);
      i++;
    }
    const start = chunk[0].start;
    const end = chunk[chunk.length - 1].end;

    let text = '';
    for (let j = 0; j < chunk.length; j++) {
      const w = chunk[j];
      const wEnd = j < chunk.length - 1 ? chunk[j + 1].start : w.end;
      const durCs = Math.max(1, Math.round((wEnd - w.start) * 100));
      const clean = w.word.trim().toUpperCase().replace(/[{}\\]/g, '');
      text += `{\\k${durCs}}${clean} `;
    }
    lines.push(`Dialogue: 0,${ts(start)},${ts(end)},Cap,,0,0,0,,${text.trim()}`);
  }

  return header + lines.join('\n') + '\n';
}

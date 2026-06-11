import { execFile } from 'child_process';
import { promisify } from 'util';
import { Cut, Word } from './store';

const exec = promisify(execFile);

export async function getDuration(file: string): Promise<number> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    file,
  ]);
  return parseFloat(stdout.trim());
}

// Extrae el audio comprimido para mandarlo a Whisper (límite 25MB)
export async function extractAudio(input: string, output: string) {
  await exec('ffmpeg', [
    '-y', '-i', input,
    '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k',
    output,
  ]);
}

// Dado los cortes a eliminar, devuelve los segmentos que se conservan
export function keepSegments(cuts: Cut[], duration: number): Array<[number, number]> {
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const keep: Array<[number, number]> = [];
  let cursor = 0;
  for (const c of sorted) {
    const s = Math.max(0, c.start);
    const e = Math.min(duration, c.end);
    if (s > cursor + 0.05) keep.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < duration - 0.05) keep.push([cursor, duration]);
  return keep.length ? keep : [[0, duration]];
}

// Re-mapea los timestamps de las palabras a la línea de tiempo post-corte
export function remapWords(words: Word[], segments: Array<[number, number]>): Word[] {
  const out: Word[] = [];
  let offset = 0;
  for (const [s, e] of segments) {
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      if (mid >= s && mid < e) {
        out.push({
          word: w.word,
          start: w.start - s + offset,
          end: Math.min(w.end, e) - s + offset,
        });
      }
    }
    offset += e - s;
  }
  return out;
}

type RenderOpts = {
  input: string;
  output: string;
  assFile: string;
  width: number;
  height: number;
  segments: Array<[number, number]>; // segmentos a conservar
};

export async function renderVideo(opts: RenderOpts) {
  const { input, output, assFile, width, height, segments } = opts;
  const scaleCrop = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  const subs = `subtitles=${assFile.replace(/([:'])/g, '\\$1')}`;

  let args: string[];
  if (segments.length === 1 && segments[0][0] === 0) {
    // Sin cortes: filtro simple
    args = [
      '-y', '-i', input,
      '-vf', `${scaleCrop},${subs}`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      output,
    ];
  } else {
    // Con cortes: trim + concat de cada segmento, después subtítulos
    const parts: string[] = [];
    const labels: string[] = [];
    segments.forEach(([s, e], i) => {
      parts.push(`[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}]`);
      parts.push(`[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[a${i}]`);
      labels.push(`[v${i}][a${i}]`);
    });
    parts.push(`${labels.join('')}concat=n=${segments.length}:v=1:a=1[vc][ac]`);
    parts.push(`[vc]${scaleCrop},${subs}[vout]`);
    args = [
      '-y', '-i', input,
      '-filter_complex', parts.join(';'),
      '-map', '[vout]', '-map', '[ac]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      output,
    ];
  }
  await exec('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64 });
}

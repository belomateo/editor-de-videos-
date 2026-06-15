import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Cut, Word } from './store';

const exec = promisify(execFile);

// Directorio temporal para los archivos de estadísticas de detección de foco
const TMP_DIR_FOR_STATS = os.tmpdir();

export async function getDuration(file: string): Promise<number> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    file,
  ]);
  return parseFloat(stdout.trim());
}

// Devuelve el ancho y alto del video original
export async function getDimensions(file: string): Promise<{ width: number; height: number }> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    file,
  ]);
  const [w, h] = stdout.trim().split(',').map((n) => parseInt(n, 10));
  return { width: w || 1920, height: h || 1080 };
}

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

type Zoom = { start: number; end: number; scale: number };

// Detecta el centro horizontal de interés (dónde está la persona/acción) en un tramo del video.
// Analiza el detalle visual (rango de luminancia + saturación) por franjas verticales.
// Devuelve una fracción 0-1: 0 = foco a la izquierda, 0.5 = centro, 1 = derecha.
export async function detectFocusFraction(
  input: string,
  start: number,
  end: number,
  srcW: number,
  srcH: number
): Promise<number> {
  const bands = 5;
  const bw = Math.floor(srcW / bands);
  const dur = Math.max(0.1, end - start);
  const times = [start + dur * 0.3, start + dur * 0.5, start + dur * 0.7];
  const scores = new Array(bands).fill(0);

  for (const t of times) {
    for (let b = 0; b < bands; b++) {
      const statsFile = path.join(TMP_DIR_FOR_STATS, `fstats-${Date.now()}-${b}-${Math.random().toString(36).slice(2, 6)}.txt`);
      try {
        await exec('ffmpeg', [
          '-y', '-ss', String(t), '-i', input,
          '-vf', `crop=${bw}:${srcH}:${b * bw}:0,signalstats,metadata=print:file=${statsFile.replace(/\\/g, '/')}`,
          '-frames:v', '1', '-f', 'null', '-',
        ], { maxBuffer: 1024 * 1024 * 16 });
        const txt = fs.readFileSync(statsFile, 'utf8');
        const get = (k: string) => {
          const m = txt.match(new RegExp(k + '=([\\d.]+)'));
          return m ? parseFloat(m[1]) : 0;
        };
        const range = get('YHIGH') - get('YLOW');
        const sat = get('SATAVG');
        scores[b] += range + sat * 0.5;
        fs.unlinkSync(statsFile);
      } catch {
        // si falla, ignoramos esa muestra
      }
    }
  }

  const total = scores.reduce((a, b) => a + b, 0);
  if (total === 0) return 0.5; // sin datos, centramos
  // Centro de masa ponderado de las bandas → fracción 0-1
  let weighted = 0;
  scores.forEach((s, b) => { weighted += s * (b + 0.5) / bands; });
  return Math.max(0, Math.min(1, weighted / total));
}


// Devuelve null si el intervalo cae enteramente dentro de un corte.
export function remapInterval(
  start: number,
  end: number,
  segments: Array<[number, number]>
): { start: number; end: number } | null {
  let offset = 0;
  for (const [s, e] of segments) {
    // ¿El centro del zoom cae en este segmento conservado?
    const mid = (start + end) / 2;
    if (mid >= s && mid < e) {
      const newStart = Math.max(start, s) - s + offset;
      const newEnd = Math.min(end, e) - s + offset;
      return { start: newStart, end: newEnd };
    }
    offset += e - s;
  }
  return null;
}

type RenderOpts = {
  input: string;
  output: string;
  assFile: string;
  width: number;
  height: number;
  segments: Array<[number, number]>; // segmentos a conservar
  zooms?: Zoom[]; // zooms en la línea de tiempo POST-corte
  cropXExpr?: string; // expresión de offset X para el crop (encuadre inteligente). Default: centrado
};

// Genera la expresión de escala dinámica para los zooms.
// Cada zoom hace un acercamiento suave (ease in/out) en su ventana de tiempo.
function buildZoomExpr(zooms: Zoom[]): string {
  if (!zooms.length) return '1';
  // Construimos una expresión anidada: si t está dentro de un zoom, interpolamos la escala
  // Usamos una transición de 0.4s para entrar y salir suave
  const T = 0.4;
  let expr = '1';
  for (const z of zooms) {
    const peak = Math.max(1.05, Math.min(2, z.scale || 1.25));
    const s = z.start;
    const e = z.end;
    // ease-in: de s a s+T sube de 1 a peak
    // sostenido: de s+T a e-T se mantiene en peak
    // ease-out: de e-T a e baja de peak a 1
    const inEnd = s + T;
    const outStart = Math.max(inEnd, e - T);
    const easeIn = `(1+(${peak}-1)*(t-${s})/${T})`;
    const easeOut = `(${peak}-(${peak}-1)*(t-${outStart})/${T})`;
    const segExpr = `if(between(t,${s},${inEnd}),${easeIn},if(between(t,${inEnd},${outStart}),${peak},if(between(t,${outStart},${e}),${easeOut},1)))`;
    // Si hay solapamiento tomamos el máximo (el más cercano gana)
    expr = `max(${expr},${segExpr})`;
  }
  return expr;
}

export async function renderVideo(opts: RenderOpts) {
  const { input, output, assFile, width, height, segments, zooms = [], cropXExpr } = opts;
  // Crop con offset X personalizado (encuadre inteligente). Si no se especifica, centra.
  const cropX = cropXExpr ?? '(iw-ow)/2';
  const scaleCrop = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:${cropX}:(ih-oh)/2`;
  // Escapar la ruta del .ass para el filtro de subtítulos.
  // En Windows hay que convertir los backslashes a forward slashes (ffmpeg los acepta)
  // y escapar los dos puntos de la letra de unidad (C:) para que no se confundan con el separador de opciones.
  const escapedAss = assFile
    .replace(/\\/g, '/')      // C:\foo\bar.ass -> C:/foo/bar.ass
    .replace(/:/g, '\\:')      // C:/foo -> C\:/foo
    .replace(/'/g, "\\'");
  const subs = `subtitles='${escapedAss}'`;

  // Filtro de zoom: usamos scale dinámico + crop centrado.
  // El truco: escalamos el frame por el factor de zoom y recortamos al centro.
  let zoomFilter = '';
  if (zooms.length) {
    const z = buildZoomExpr(zooms);
    // Escalamos manteniendo centro: sobre-escalamos y recortamos a width x height
    zoomFilter = `,scale=w='iw*(${z})':h='ih*(${z})':eval=frame,crop=${width}:${height}:(iw-${width})/2:(ih-${height})/2`;
  }

  let args: string[];
  if (segments.length === 1 && segments[0][0] === 0 && segments[0][1] !== 0) {
    // Sin cortes: filtro simple (+ zoom si hay)
    args = [
      '-y', '-i', input,
      '-vf', `${scaleCrop}${zoomFilter},${subs}`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      output,
    ];
  } else {
    // Con cortes: trim + concat de cada segmento, después zoom + subtítulos
    const parts: string[] = [];
    const labels: string[] = [];
    segments.forEach(([s, e], i) => {
      parts.push(`[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}]`);
      parts.push(`[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[a${i}]`);
      labels.push(`[v${i}][a${i}]`);
    });
    parts.push(`${labels.join('')}concat=n=${segments.length}:v=1:a=1[vc][ac]`);
    parts.push(`[vc]${scaleCrop}${zoomFilter},${subs}[vout]`);
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

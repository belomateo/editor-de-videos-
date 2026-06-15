import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { getProject, saveProject, OUTPUTS_DIR, TMP_DIR } from '@/lib/store';
import { keepSegments, remapWords, remapInterval, renderVideo, getDimensions, detectFocusFraction } from '@/lib/ffmpeg';
import { buildKaraokeAss } from '@/lib/ass';

export const runtime = 'nodejs';
export const maxDuration = 900;

const PRESETS = {
  vertical: { width: 1080, height: 1920 },   // TikTok, Reels, Shorts
  horizontal: { width: 1920, height: 1080 }, // YouTube, LinkedIn
};

export async function POST(req: NextRequest) {
  const {
    id,
    platform = 'vertical',
    applyCuts = true,
    highlightColor = '#FFC857',
    selectedCuts,
    clip, // { start, end, titulo } — si viene, renderiza solo ese tramo (modo Clips)
    renderAllClips = false, // si true, renderiza todos los clips detectados
    applyZooms = true, // si true, aplica los zooms detectados por la IA
    selectedZooms, // zooms activados manualmente (sobrescribe los del análisis)
    framing = 'auto', // 'auto' | 'left' | 'center' | 'right' — encuadre vertical
  } = await req.json();
  const project = getProject(id);
  if (!project?.words?.length) {
    return NextResponse.json({ error: 'Primero transcribí el video' }, { status: 400 });
  }
  const preset = PRESETS[platform as keyof typeof PRESETS] || PRESETS.vertical;

  // Calcula la expresión de offset X del crop según el modo de encuadre.
  // Solo tiene efecto en vertical (donde se recorta a los lados).
  // 'auto' detecta dónde está la persona; left/center/right es manual.
  async function cropExprFor(start: number, end: number): Promise<string | undefined> {
    if (platform !== 'vertical') return undefined; // horizontal no recorta lateralmente
    if (framing === 'left') return '0';
    if (framing === 'center') return '(iw-ow)/2';
    if (framing === 'right') return '(iw-ow)';
    // auto: detectar la fracción de foco y convertirla a offset
    try {
      const dims = await getDimensions(project!.sourceFile);
      const frac = await detectFocusFraction(project!.sourceFile, start, end, dims.width, dims.height);
      // frac 0-1 → offset entre 0 y (iw-ow). Usamos expresión relativa para que funcione post-scale.
      return `(iw-ow)*${frac.toFixed(3)}`;
    } catch {
      return '(iw-ow)/2';
    }
  }

  try {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });

    // Render de todos los clips de una
    if (renderAllClips) {
      if (!project.clips?.length) {
        return NextResponse.json({ error: 'No hay clips detectados. Usá "Detectar clips" primero.' }, { status: 400 });
      }
      project.renders = project.renders || [];
      for (const cl of project.clips) {
        const segments: Array<[number, number]> = [[Math.max(0, cl.start), Math.min(project.duration || cl.end, cl.end)]];
        const words = remapWords(project.words, segments);
        const renderId = nanoid(6);
        const assPath = path.join(TMP_DIR, `${id}-clip-${renderId}.ass`);
        fs.writeFileSync(assPath, buildKaraokeAss(words, { ...preset, highlightColor }));
        const outFile = path.join(OUTPUTS_DIR, `${id}-clip-${renderId}.mp4`);
        const cropXExpr = await cropExprFor(cl.start, cl.end);
        await renderVideo({
          input: project.sourceFile,
          output: outFile,
          assFile: assPath,
          ...preset,
          segments,
          cropXExpr,
        });
        project.renders.unshift({
          id: renderId,
          platform: 'vertical',
          file: outFile,
          label: `Clip: ${cl.titulo}`,
          createdAt: new Date().toISOString(),
        });
      }
      project.status = 'renderizado';
      saveProject(project);
      return NextResponse.json(project);
    }

    let segments: Array<[number, number]>;
    if (clip) {
      segments = [[Math.max(0, clip.start), Math.min(project.duration || clip.end, clip.end)]];
    } else {
      const cuts = applyCuts ? (selectedCuts ?? project.analysis?.cortes ?? []) : [];
      segments = keepSegments(cuts, project.duration || 0);
    }
    const words = remapWords(project.words, segments);

    // Remapear los zooms a la línea de tiempo post-corte
    let zooms: Array<{ start: number; end: number; scale: number }> = [];
    if (applyZooms) {
      const rawZooms = selectedZooms ?? project.analysis?.zooms ?? [];
      for (const z of rawZooms) {
        const remapped = remapInterval(z.start, z.end, segments);
        if (remapped) zooms.push({ start: remapped.start, end: remapped.end, scale: z.scale });
      }
    }

    const assPath = path.join(TMP_DIR, `${id}-${platform}.ass`);
    fs.writeFileSync(assPath, buildKaraokeAss(words, { ...preset, highlightColor }));

    const renderId = nanoid(6);
    const suffix = clip ? `clip-${renderId}` : `${platform}-${renderId}`;
    const outFile = path.join(OUTPUTS_DIR, `${id}-${suffix}.mp4`);
    // Encuadre inteligente: detectamos el foco en el tramo relevante
    const focusStart = clip ? clip.start : (segments[0]?.[0] ?? 0);
    const focusEnd = clip ? clip.end : (segments[0]?.[1] ?? (project.duration || 0));
    const cropXExpr = await cropExprFor(focusStart, focusEnd);
    await renderVideo({
      input: project.sourceFile,
      output: outFile,
      assFile: assPath,
      ...preset,
      segments,
      zooms,
      cropXExpr,
    });

    project.renders = project.renders || [];
    project.renders.unshift({
      id: renderId,
      platform: platform as 'vertical' | 'horizontal',
      file: outFile,
      label: clip?.titulo ? `Clip: ${clip.titulo}` : undefined,
      createdAt: new Date().toISOString(),
    });
    project.status = 'renderizado';
    saveProject(project);
    return NextResponse.json(project);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { getProject, saveProject, OUTPUTS_DIR, TMP_DIR } from '@/lib/store';
import { keepSegments, remapWords, renderVideo } from '@/lib/ffmpeg';
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
  } = await req.json();
  const project = getProject(id);
  if (!project?.words?.length) {
    return NextResponse.json({ error: 'Primero transcribí el video' }, { status: 400 });
  }
  const preset = PRESETS[platform as keyof typeof PRESETS] || PRESETS.vertical;

  try {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });

    let segments: Array<[number, number]>;
    if (clip) {
      segments = [[Math.max(0, clip.start), Math.min(project.duration || clip.end, clip.end)]];
    } else {
      const cuts = applyCuts ? (selectedCuts ?? project.analysis?.cortes ?? []) : [];
      segments = keepSegments(cuts, project.duration || 0);
    }
    const words = remapWords(project.words, segments);

    const assPath = path.join(TMP_DIR, `${id}-${platform}.ass`);
    fs.writeFileSync(assPath, buildKaraokeAss(words, { ...preset, highlightColor }));

    const renderId = nanoid(6);
    const suffix = clip ? `clip-${renderId}` : `${platform}-${renderId}`;
    const outFile = path.join(OUTPUTS_DIR, `${id}-${suffix}.mp4`);
    await renderVideo({
      input: project.sourceFile,
      output: outFile,
      assFile: assPath,
      ...preset,
      segments,
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

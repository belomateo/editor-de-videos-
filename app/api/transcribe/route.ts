import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProject, saveProject, TMP_DIR } from '@/lib/store';
import { extractAudio, getDuration } from '@/lib/ffmpeg';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Proyecto no existe' }, { status: 404 });

  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const audioPath = path.join(TMP_DIR, `${id}.mp3`);
    await extractAudio(project.sourceFile, audioPath);
    project.duration = await getDuration(project.sourceFile);

    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(audioPath)], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('language', 'es');

    // Groq es mucho más barato (y tiene capa gratis). Si no hay key de Groq, usa OpenAI.
    const useGroq = !!process.env.GROQ_API_KEY;
    form.append('model', useGroq ? 'whisper-large-v3' : 'whisper-1');
    const url = useGroq
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions';
    const key = useGroq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Whisper: ${res.status} ${await res.text()}`);
    const data = await res.json();

    project.words = (data.words || []).map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));
    project.transcript = data.text || '';
    project.status = 'transcripto';
    await saveProject(project);
    fs.unlinkSync(audioPath);

    return NextResponse.json(project);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

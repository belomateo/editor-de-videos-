import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/store';
import { editWithChat } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { id, instruccion, estado, historial } = await req.json();
  const project = getProject(id);
  if (!project?.words?.length) {
    return NextResponse.json({ error: 'Primero transcribí y analizá el video' }, { status: 400 });
  }
  if (!instruccion?.trim()) {
    return NextResponse.json({ error: 'Escribí qué querés cambiar' }, { status: 400 });
  }

  try {
    const result = await editWithChat(
      instruccion.trim(),
      {
        duration: project.duration || 0,
        cortes: estado?.cortes ?? project.analysis?.cortes ?? [],
        zooms: estado?.zooms ?? project.analysis?.zooms ?? [],
        color: estado?.color ?? '#FFC857',
        framing: estado?.framing ?? 'auto',
        platform: estado?.platform ?? 'vertical',
        words: project.words,
      },
      historial ?? []
    );
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

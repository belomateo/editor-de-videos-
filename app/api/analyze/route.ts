import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/store';
import { analyzeTranscript } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { id, brief } = await req.json();
  const project = await getProject(id);
  if (!project?.words?.length) {
    return NextResponse.json({ error: 'Primero transcribí el video' }, { status: 400 });
  }
  try {
    project.analysis = await analyzeTranscript(
      project.words,
      project.transcript || '',
      project.duration || 0,
      brief || ''
    );
    project.status = 'analizado';
    await saveProject(project);
    return NextResponse.json(project);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

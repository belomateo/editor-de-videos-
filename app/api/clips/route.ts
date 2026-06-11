import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/store';
import { findClips } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const { id, brief } = await req.json();
  const project = getProject(id);
  if (!project?.words?.length) {
    return NextResponse.json({ error: 'Primero transcribí el video' }, { status: 400 });
  }
  try {
    project.clips = await findClips(project.words, project.duration || 0, brief || '');
    saveProject(project);
    return NextResponse.json(project);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/store';
import { uploadToDrive } from '@/lib/drive';

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const { id, renderId } = await req.json();
  const project = await getProject(id);
  const render = project?.renders?.find((r) => r.id === renderId);
  if (!project || !render) {
    return NextResponse.json({ error: 'Render no encontrado' }, { status: 404 });
  }
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json(
      { error: 'Falta configurar Google Drive. Corré: node scripts/get-google-token.mjs (ver README)' },
      { status: 400 }
    );
  }
  try {
    const base = project.name.replace(/\.[^.]+$/, '');
    const name = `${base} — ${render.label || render.platform} — ${render.id}.mp4`;
    const { link } = await uploadToDrive(render.file, name);
    render.driveLink = link;
    await saveProject(project);
    return NextResponse.json(project);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

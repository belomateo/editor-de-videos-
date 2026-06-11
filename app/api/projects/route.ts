import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { listProjects, saveProject, UPLOADS_DIR, Project } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(listProjects());
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });

  const id = nanoid(8);
  const ext = path.extname(file.name) || '.mp4';
  const dest = path.join(UPLOADS_DIR, `${id}${ext}`);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  const project: Project = {
    id,
    name: file.name,
    status: 'subido',
    sourceFile: dest,
    renders: [],
    createdAt: new Date().toISOString(),
  };
  saveProject(project);
  return NextResponse.json(project);
}

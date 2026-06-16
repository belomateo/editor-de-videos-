import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { saveProject, UPLOADS_DIR, Project } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

function extractFileId(input: string): string {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /open\?id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim();
  throw new Error('No se pudo extraer el ID del archivo de Drive');
}

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
}

export async function POST(req: NextRequest) {
  const { input } = await req.json();
  if (!input) return NextResponse.json({ error: 'Falta la URL o ID del archivo' }, { status: 400 });

  let fileId: string;
  try {
    fileId = extractFileId(input);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const token = await getAccessToken();

  // Obtener metadata para el nombre del archivo
  let fileName = `video-${fileId}.mp4`;
  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta.name) fileName = meta.name;
    }
  } catch {}

  // Descargar
  const downloadUrl = token
    ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    : `https://drive.google.com/uc?export=download&id=${fileId}&confirm=1`;

  const res = await fetch(downloadUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `No se pudo descargar (${res.status}). Asegurate que el archivo sea público.` },
      { status: 400 }
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    return NextResponse.json(
      { error: 'Drive bloqueó la descarga. El archivo debe estar compartido como "Cualquiera con el enlace puede ver".' },
      { status: 400 }
    );
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const id = nanoid(8);
  const ext = path.extname(fileName) || '.mp4';
  const dest = path.join(UPLOADS_DIR, `${id}${ext}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));

  const project: Project = {
    id,
    name: fileName,
    status: 'subido',
    sourceFile: dest,
    renders: [],
    createdAt: new Date().toISOString(),
  };
  await saveProject(project);
  return NextResponse.json(project);
}

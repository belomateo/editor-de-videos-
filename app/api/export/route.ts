import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { Readable } from 'stream';
import { getProject } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 120;
// Genera un ZIP "listo para publicar": el clip renderizado + un .txt con el caption
// y hashtags de cada plataforma, todo junto y nombrado claro.
export async function POST(req: NextRequest) {
  const { id, renderId } = await req.json();
  const project = await getProject(id);
  if (!project) {
    return new Response(JSON.stringify({ error: 'Proyecto no encontrado' }), { status: 404 });
  }

  // Si viene renderId, exporta solo ese render. Si no, todos.
  const renders = renderId
    ? project.renders?.filter((r) => r.id === renderId)
    : project.renders;

  if (!renders?.length) {
    return new Response(JSON.stringify({ error: 'No hay renders para exportar' }), { status: 400 });
  }

  const captions = project.analysis?.captions || {};
  const hooks = project.analysis?.hooks || [];
  const baseName = project.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();

  const archive = archiver('zip', { zlib: { level: 5 } });
  const pass = new PassThrough();
  archive.pipe(pass);

  for (const render of renders) {
    if (!fs.existsSync(render.file)) continue;
    const label = (render.label || render.platform).replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    const folder = label || render.id;

    // El video
    archive.file(render.file, { name: `${folder}/${baseName}-${render.id}.mp4` });

    // El caption: armamos un .txt con todo lo necesario para publicar
    let txt = `═══════════════════════════════════════\n`;
    txt += `  ${render.label || project.name}\n`;
    txt += `═══════════════════════════════════════\n\n`;

    if (hooks.length) {
      txt += `── GANCHOS (para los primeros 3 segundos) ──\n`;
      hooks.forEach((h, i) => { txt += `${i + 1}. ${h}\n`; });
      txt += `\n`;
    }

    txt += `── CAPTIONS POR PLATAFORMA ──\n\n`;
    for (const [plat, cap] of Object.entries(captions)) {
      txt += `▸ ${plat.toUpperCase()}\n${cap}\n\n`;
    }

    archive.append(txt, { name: `${folder}/caption-${render.id}.txt` });
  }

  archive.finalize();

  const zipName = `${baseName}-publicar.zip`;
  return new Response(Readable.toWeb(pass) as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  });
}

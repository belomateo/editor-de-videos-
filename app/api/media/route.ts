import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { DATA_DIR } from '@/lib/store';

export const runtime = 'nodejs';

// Sirve videos (subidos y renderizados) con soporte de Range para poder hacer seek
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('f') || '';
  const full = path.resolve(file);
  if (!full.startsWith(DATA_DIR) || !fs.existsSync(full)) {
    return new Response('No encontrado', { status: 404 });
  }
  const stat = fs.statSync(full);
  const range = req.headers.get('range');

  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    const start = m ? parseInt(m[1]) : 0;
    const end = m && m[2] ? parseInt(m[2]) : stat.size - 1;
    const stream = fs.createReadStream(full, { start, end });
    return new Response(Readable.toWeb(stream) as any, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': 'video/mp4',
      },
    });
  }
  const stream = fs.createReadStream(full);
  return new Response(Readable.toWeb(stream) as any, {
    headers: { 'Content-Length': String(stat.size), 'Content-Type': 'video/mp4' },
  });
}

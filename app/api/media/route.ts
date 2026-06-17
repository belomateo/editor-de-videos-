import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { DATA_DIR } from '@/lib/store';

export const runtime = 'nodejs';

// Sirve videos (subidos y renderizados) con soporte de Range para seek.
// Robustecido: maneja errores de stream, aborts del navegador, y siempre
// responde con Range válido para que el player no reciba 503.
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('f') || '';
  const full = path.resolve(file);

  // Seguridad: solo servir archivos dentro de DATA_DIR
  if (!full.startsWith(path.resolve(DATA_DIR))) {
    return new Response('Acceso denegado', { status: 403 });
  }
  if (!fs.existsSync(full)) {
    return new Response('No encontrado', { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(full);
  } catch {
    return new Response('No se pudo leer el archivo', { status: 404 });
  }

  const fileSize = stat.size;
  const range = req.headers.get('range');

  // Helper: crea un Response a partir de un read stream, manejando errores
  function streamResponse(start: number, end: number, status: number) {
    const nodeStream = fs.createReadStream(full, { start, end });

    // Convertir a web stream con manejo de errores y abort
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          try {
            controller.enqueue(chunk);
          } catch {
            // El controller ya se cerró (cliente abortó) — destruir el stream
            nodeStream.destroy();
          }
        });
        nodeStream.on('end', () => {
          try { controller.close(); } catch {}
        });
        nodeStream.on('error', (err) => {
          try { controller.error(err); } catch {}
        });
      },
      cancel() {
        // El navegador canceló la descarga (ej: seek a otra parte) — limpiar
        nodeStream.destroy();
      },
    });

    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Cache-Control': 'no-cache',
    };
    if (status === 206) {
      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    }

    return new Response(webStream as any, { status, headers });
  }

  // Si pide un rango, devolver 206 con ese rango
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    let start = m ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : fileSize - 1;

    // Validar límites para no romper
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= fileSize) end = fileSize - 1;
    if (start > end) start = 0;

    return streamResponse(start, end, 206);
  }

  // Sin rango: servir el archivo completo (también con Accept-Ranges para que el player sepa que puede pedir rangos)
  return streamResponse(0, fileSize - 1, 200);
}

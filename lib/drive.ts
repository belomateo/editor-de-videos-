import fs from 'fs';
import path from 'path';

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth: ${await res.text()}`);
  return (await res.json()).access_token;
}

/**
 * Sube un archivo a Google Drive (upload resumable) y devuelve el link.
 * Si está definido GOOGLE_DRIVE_FOLDER_ID, lo sube a esa carpeta.
 */
export async function uploadToDrive(filePath: string, name?: string): Promise<{ id: string; link: string }> {
  const token = await getAccessToken();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const meta: any = { name: name || path.basename(filePath) };
  if (folderId) meta.parents = [folderId];

  const init = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(meta),
    }
  );
  if (!init.ok) throw new Error(`Drive (inicio): ${await init.text()}`);
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('Drive no devolvió URL de subida');

  const data = fs.readFileSync(filePath);
  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'content-length': String(data.length) },
    body: data,
  });
  if (!up.ok) throw new Error(`Drive (subida): ${await up.text()}`);
  const file = await up.json();

  const info = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?fields=webViewLink`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await info.json();
  return { id: file.id, link: j.webViewLink || `https://drive.google.com/file/d/${file.id}/view` };
}

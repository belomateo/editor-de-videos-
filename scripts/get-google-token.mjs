// Corré esto UNA VEZ en tu compu para obtener el GOOGLE_REFRESH_TOKEN.
//
// Antes:
// 1. Entrá a https://console.cloud.google.com → creá un proyecto
// 2. APIs y servicios → Habilitar APIs → buscá "Google Drive API" → Habilitar
// 3. Pantalla de consentimiento OAuth → Externa → agregate como usuario de prueba
// 4. Credenciales → Crear credenciales → ID de cliente OAuth → "Aplicación de escritorio"
// 5. Copiá el Client ID y Client Secret
//
// Después:
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-token.mjs
//
// Se abre una URL, autorizás con tu cuenta, y el script te imprime el refresh token.

import http from 'http';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET como variables de entorno.');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
  });

console.log('\n1) Abrí esta URL en tu navegador y autorizá:\n');
console.log(authUrl + '\n');
console.log('2) Esperando la autorización...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('Falta el código.');
    return;
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const data = await tokenRes.json();
  res.end('Listo, volvé a la terminal.');
  server.close();

  if (data.refresh_token) {
    console.log('✅ Listo. Cargá estas variables en Railway:\n');
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\nOpcional: GOOGLE_DRIVE_FOLDER_ID=<id de la carpeta destino>');
    console.log('(el ID es lo que aparece en la URL de la carpeta en Drive)');
  } else {
    console.error('No vino refresh_token. Respuesta:', data);
  }
});

server.listen(PORT);

# ZW Clipper

Pipeline de edición de video con IA para ZW Labs: subís el crudo y salís con un video editado, con subtítulos animados estilo karaoke, cortes inteligentes, hooks y captions por plataforma.

## Cómo funciona

1. **Subís el video crudo** (talking head, screen recording, clip largo)
2. **Transcribir** → Whisper saca el texto con timestamps por palabra (Groq si tenés la key — casi gratis — o OpenAI)
3. **Analizar con IA** → Claude detecta silencios, muletillas y arranques en falso para cortar; sugiere 5 hooks y captions para TikTok, Instagram, YouTube y LinkedIn. Le podés pasar tu brief y tus ganchos en el campo de texto.
4. **Detectar clips** (para videos largos) → Claude encuentra los 3-6 mejores momentos virales del video y los recorta en formato Short/Reel, cada uno con su hook.
5. **Render** → elegís 9:16 o 16:9 y el color de resaltado; ffmpeg aplica los cortes y quema los subtítulos karaoke.
6. **Subir a Drive** → un click y el video queda en tu carpeta de Google Drive listo para que el equipo lo programe.

## Requisitos

- Node 20+
- ffmpeg instalado (`brew install ffmpeg` en Mac, `apt install ffmpeg` en Linux). En Railway ya viene en el Dockerfile.
- API keys: OpenAI (Whisper) y Anthropic (Claude)

## Correr local

```bash
cp .env.example .env   # completá las keys
npm install
npm run dev
```

Abrí http://localhost:3000

## Deploy en Railway (recomendado)

> ¿Por qué Railway y no Vercel? Los renders con ffmpeg tardan minutos y Vercel corta las funciones serverless. Railway corre el contenedor completo sin límite de tiempo.

1. Subí este repo a GitHub
2. En [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Railway detecta el `Dockerfile` automáticamente
4. En **Variables**, cargá `OPENAI_API_KEY` y `ANTHROPIC_API_KEY`
5. En **Settings → Volumes**, montá un volumen en `/data` (ahí viven los videos; sin volumen se pierden en cada deploy)
6. Generá el dominio público en Settings → Networking

## Configurar Google Drive (una sola vez)

1. En [console.cloud.google.com](https://console.cloud.google.com) creá un proyecto y habilitá la **Google Drive API**
2. Pantalla de consentimiento OAuth → Externa → agregate como usuario de prueba
3. Credenciales → Crear ID de cliente OAuth → tipo **Aplicación de escritorio**
4. En tu compu: `GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-token.mjs`
5. Autorizá en el navegador y copiá las variables que imprime el script a Railway
6. Opcional: `GOOGLE_DRIVE_FOLDER_ID` con el ID de la carpeta destino (está en la URL de la carpeta)

## Costos estimados por video de 10 min

- Transcripción con Groq: ~USD 0.004 (y tiene capa gratuita) · con OpenAI: ~USD 0.06
- Claude (análisis + clips): ~USD 0.03–0.08
- Corte, subtítulos y render: gratis (ffmpeg en tu servidor)
- Railway: plan Hobby USD 5/mes alcanza para empezar

## Estructura

```
app/
  page.tsx              → upload + lista de proyectos
  editor/[id]/page.tsx  → editor (transcripción, cortes, hooks, render)
  api/
    projects/           → CRUD de proyectos
    transcribe/         → Whisper (Groq u OpenAI) con timestamps por palabra
    analyze/            → Claude: cortes + hooks + captions
    clips/              → Claude: detecta momentos virales en videos largos
    render/             → ffmpeg: cortes + subtítulos ASS karaoke (video completo o clip)
    drive/              → sube renders a Google Drive
    media/              → sirve los videos con soporte de seek
lib/
  ass.ts                → generador de subtítulos karaoke (.ass)
  ffmpeg.ts             → cortes, concat, render por formato
  claude.ts             → prompt y parsing del análisis
  store.ts              → storage simple en JSON (sin DB en V1)
```

## Roadmap

- **V1.2**: chat conversacional para iterar el edit, zooms automáticos en momentos clave, b-roll, render de todos los clips en un click
- **V2**: cola de renders en background (BullMQ), multi-usuario con Supabase, integración con n8n para avisos por WhatsApp cuando un video está listo

## Notas técnicas

- Sin base de datos en V1: los proyectos viven en `data/projects.json`. Cuando haya más de un usuario, migrar a Supabase.
- El render es síncrono (el request espera). Para videos de +20 min conviene mover el render a una cola (BullMQ + Redis) en V1.1.
- Los subtítulos usan formato ASS con karaoke (`\k`): cada palabra se pinta del color elegido al ser pronunciada.

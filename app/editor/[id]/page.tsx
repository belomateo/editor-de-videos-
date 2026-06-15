'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Timeline, { Cut } from '../../components/Timeline';
import PreviewPlayer, { PreviewHandle } from '../../components/PreviewPlayer';

type Clip = { start: number; end: number; titulo: string; hook: string; razon: string };
type Zoom = { start: number; end: number; scale: number; razon: string };
type Project = {
  id: string;
  name: string;
  status: string;
  sourceFile: string;
  duration?: number;
  transcript?: string;
  analysis?: {
    cortes: Cut[];
    zooms?: Zoom[];
    hooks: string[];
    captions: Record<string, string>;
    resumen?: string;
  };
  clips?: Clip[];
  renders?: { id: string; platform: string; file: string; label?: string; driveLink?: string; createdAt: string }[];
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Project | null>(null);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [enabledCuts, setEnabledCuts] = useState<boolean[]>([]);
  const [zooms, setZooms] = useState<Zoom[]>([]);
  const [enabledZooms, setEnabledZooms] = useState<boolean[]>([]);
  const [platform, setPlatform] = useState<'vertical' | 'horizontal'>('vertical');
  const [color, setColor] = useState('#FFC857');
  const [framing, setFraming] = useState<'auto' | 'left' | 'center' | 'right'>('auto');
  const [currentTime, setCurrentTime] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const playerRef = useRef<PreviewHandle>(null);

  async function load() {
    const data = await fetch(`/api/projects/${id}`).then((r) => r.json());
    setP(data);
    if (data.analysis?.cortes) {
      setCuts(data.analysis.cortes);
      setEnabledCuts(data.analysis.cortes.map(() => true));
    }
    if (data.analysis?.zooms) {
      setZooms(data.analysis.zooms);
      setEnabledZooms(data.analysis.zooms.map(() => true));
    }
  }
  useEffect(() => { load(); }, [id]);

  async function call(endpoint: string, body: any, label: string) {
    setBusy(label);
    setError('');
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy('');
    if (data.error) { setError(data.error); return; }
    setP(data);
    if (data.analysis?.cortes) {
      setCuts(data.analysis.cortes);
      setEnabledCuts(data.analysis.cortes.map(() => true));
    }
    if (data.analysis?.zooms) {
      setZooms(data.analysis.zooms);
      setEnabledZooms(data.analysis.zooms.map(() => true));
    }
  }

  if (!p) return <p className="text-mute">Cargando…</p>;

  const selectedCuts = cuts.filter((_, i) => enabledCuts[i]);
  const selectedZooms = zooms.filter((_, i) => enabledZooms[i]);
  const mediaSrc = `/api/media?f=${encodeURIComponent(p.sourceFile)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <a href="/" className="text-mute text-sm hover:text-zinc-300">← Proyectos</a>
          <h1 className="text-xl font-bold">{p.name}</h1>
          {p.duration && <p className="text-xs text-mute">{fmt(p.duration)} · {p.status}</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" disabled={!!busy}
            onClick={() => call('transcribe', { id }, 'Transcribiendo con Whisper…')}>
            1 · Transcribir
          </button>
          <button className="btn btn-amber" disabled={!!busy || !p.transcript}
            onClick={() => call('analyze', { id, brief }, 'Analizando con Claude…')}>
            2 · Analizar con IA
          </button>
          <button className="btn btn-ghost" disabled={!!busy || !p.transcript}
            onClick={() => call('clips', { id, brief }, 'Buscando los mejores momentos…')}
            title="Detecta los mejores momentos de un video largo para sacar Shorts/Reels">
            ✂ Detectar clips
          </button>
        </div>
      </div>

      {busy && <div className="card text-amber text-sm animate-pulse">{busy}</div>}
      {error && <div className="card border-red-800 text-red-400 text-sm">{error}</div>}

      <PreviewPlayer
        ref={playerRef}
        src={mediaSrc}
        cuts={cuts}
        enabledCuts={enabledCuts}
        previewMode={previewMode}
        onTimeUpdate={setCurrentTime}
      />

      {/* Timeline visual editable */}
      {p.duration && cuts.length > 0 && (
        <section className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="tag">Timeline · {selectedCuts.length}/{cuts.length} cortes activos</h2>
            <button
              className={`btn !py-1.5 text-sm ${previewMode ? 'btn-amber' : 'btn-ghost'}`}
              onClick={() => setPreviewMode((v) => !v)}
            >
              {previewMode ? '▶ Preview activo' : '👁 Ver preview con cortes'}
            </button>
          </div>
          <Timeline
            duration={p.duration}
            cuts={cuts}
            enabledCuts={enabledCuts}
            zooms={zooms}
            enabledZooms={enabledZooms}
            currentTime={currentTime}
            onSeek={(t) => playerRef.current?.seek(t)}
            onToggleCut={(i) => setEnabledCuts((prev) => prev.map((v, j) => (j === i ? !v : v)))}
            onUpdateCut={(i, start, end) =>
              setCuts((prev) => prev.map((c, j) => (j === i ? { ...c, start, end } : c)))
            }
            onPreviewCut={(i) => {
              setPreviewMode(false);
              playerRef.current?.previewCut(cuts[i].start, cuts[i].end);
            }}
          />
        </section>
      )}

      <section className="card">
        <h2 className="tag mb-2">Tu brief / ganchos</h2>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)}
          placeholder='Tirame el contexto: "es un tutorial de automatización para ecommerce, quiero un hook agresivo tipo: dejá de perder plata respondiendo mensajes a mano…"'
          className="w-full bg-ink border border-line rounded-lg p-3 text-sm min-h-[90px] outline-none focus:border-amber/60" />
        <p className="text-xs text-mute mt-1">Se manda al análisis del paso 2. Si lo dejás vacío, la IA propone sola.</p>
      </section>

      {p.analysis && (
        <>
          {p.analysis.resumen && (
            <section className="card border-amber/40">
              <h2 className="tag mb-1">Diagnóstico IA</h2>
              <p className="text-sm">{p.analysis.resumen}</p>
            </section>
          )}

          {/* Lista detallada de cortes con toggle individual */}
          <section className="card">
            <h2 className="tag mb-2">Detalle de cortes</h2>
            {cuts.length === 0 && <p className="text-sm text-mute">La IA no encontró nada para cortar. Limpio el crudo.</p>}
            <div className="space-y-1 max-h-56 overflow-auto">
              {cuts.map((c, i) => (
                <div key={i} className={`flex items-center gap-3 text-sm py-1.5 px-2 rounded ${enabledCuts[i] ? 'bg-red-500/5' : 'opacity-50'}`}>
                  <input type="checkbox" checked={enabledCuts[i] ?? true}
                    onChange={() => setEnabledCuts((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                    className="accent-[#FFC857]" />
                  <button className="font-mono text-xs text-amber w-28 text-left hover:underline"
                    onClick={() => { setPreviewMode(false); playerRef.current?.previewCut(c.start, c.end); }}>
                    {fmt(c.start)} → {fmt(c.end)}
                  </button>
                  <span className="text-zinc-400 text-xs w-10">{Math.round((c.end - c.start) * 10) / 10}s</span>
                  <span className="flex-1">{c.razon}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Panel de zooms */}
          {zooms.length > 0 && (
            <section className="card">
              <h2 className="tag mb-2">🔍 Zooms dinámicos ({selectedZooms.length}/{zooms.length} activos)</h2>
              <p className="text-xs text-mute mb-2">Acercamientos automáticos en los momentos de énfasis para que el video se sienta más dinámico.</p>
              <div className="space-y-1 max-h-56 overflow-auto">
                {zooms.map((z, i) => (
                  <div key={i} className={`flex items-center gap-3 text-sm py-1.5 px-2 rounded ${enabledZooms[i] ? 'bg-blue-500/5' : 'opacity-50'}`}>
                    <input type="checkbox" checked={enabledZooms[i] ?? true}
                      onChange={() => setEnabledZooms((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                      className="accent-blue-400" />
                    <button className="font-mono text-xs text-blue-400 w-28 text-left hover:underline"
                      onClick={() => { setPreviewMode(false); playerRef.current?.previewCut(z.start, z.end); }}>
                      {fmt(z.start)} → {fmt(z.end)}
                    </button>
                    <span className="text-zinc-400 text-xs w-12">{z.scale}x</span>
                    <span className="flex-1">{z.razon}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <h2 className="tag mb-2">Hooks listos para la guerra</h2>
            <div className="space-y-2">
              {p.analysis.hooks.map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <button className="btn btn-ghost !px-2 !py-1 text-xs shrink-0"
                    onClick={() => navigator.clipboard.writeText(h)}>Copiar</button>
                  <p>{h}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2 className="tag mb-2">Captions por plataforma</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {Object.entries(p.analysis.captions).map(([k, v]) => (
                <div key={k} className="bg-ink border border-line rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="tag">{k}</span>
                    <button className="text-xs text-amber hover:underline"
                      onClick={() => navigator.clipboard.writeText(v)}>Copiar</button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{v}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {p.clips && p.clips.length > 0 && (
        <section className="card border-amber/40">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="tag">Clips para Shorts / Reels ({p.clips.length})</h2>
            <button className="btn btn-amber !py-1.5 text-sm" disabled={!!busy}
              onClick={() => call('render', { id, platform: 'vertical', highlightColor: color, renderAllClips: true, framing }, 'Renderizando todos los clips…')}>
              ⚡ Renderizar todos
            </button>
          </div>
          <div className="space-y-3">
            {p.clips.map((c, i) => (
              <div key={i} className="bg-ink border border-line rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-sm">{c.titulo}</p>
                    <button className="font-mono text-xs text-amber hover:underline"
                      onClick={() => { setPreviewMode(false); playerRef.current?.previewCut(c.start, c.end); }}>
                      {fmt(c.start)} → {fmt(c.end)} · {Math.round(c.end - c.start)}s
                    </button>
                  </div>
                  <button className="btn btn-amber !py-1.5" disabled={!!busy}
                    onClick={() => call('render', { id, platform: 'vertical', highlightColor: color, clip: c, framing }, `Renderizando "${c.titulo}"…`)}>
                    Renderizar 9:16
                  </button>
                </div>
                <p className="text-sm mt-2 text-zinc-300">🪝 {c.hook}</p>
                <p className="text-xs text-mute mt-1">{c.razon}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.transcript && (
        <section className="card">
          <h2 className="tag mb-3">3 · Render final</h2>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select value={platform} onChange={(e) => setPlatform(e.target.value as any)}
              className="bg-ink border border-line rounded-lg px-3 py-2 text-sm">
              <option value="vertical">9:16 — TikTok / Reels / Shorts</option>
              <option value="horizontal">16:9 — YouTube / LinkedIn</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-mute">
              Color de resaltado
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer bg-transparent" />
            </label>
            {platform === 'vertical' && (
              <label className="flex items-center gap-2 text-sm text-mute">
                Encuadre
                <select value={framing} onChange={(e) => setFraming(e.target.value as any)}
                  className="bg-ink border border-line rounded-lg px-2 py-2 text-sm">
                  <option value="auto">🎯 Auto (detecta la cara)</option>
                  <option value="center">Centro</option>
                  <option value="left">Izquierda</option>
                  <option value="right">Derecha</option>
                </select>
              </label>
            )}
            <button className="btn btn-amber" disabled={!!busy}
              onClick={() => call('render', { id, platform, highlightColor: color, applyCuts: true, selectedCuts, applyZooms: true, selectedZooms, framing }, 'Renderizando (puede tardar unos minutos)…')}>
              Renderizar {selectedCuts.length > 0 ? `(${selectedCuts.length} cortes` : ''}{selectedZooms.length > 0 ? `${selectedCuts.length > 0 ? ', ' : '('}${selectedZooms.length} zooms` : ''}{(selectedCuts.length > 0 || selectedZooms.length > 0) ? ')' : ''}
            </button>
          </div>

          {p.renders && p.renders.length > 0 && (
            <div className="space-y-3">
              {p.renders.map((r) => (
                <div key={r.id} className="bg-ink border border-line rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2 text-xs text-mute flex-wrap gap-2">
                    <span>
                      {r.label ? `${r.label} · ` : ''}
                      {r.platform === 'vertical' ? '9:16' : '16:9'} · {new Date(r.createdAt).toLocaleString('es-AR')}
                    </span>
                    <span className="flex items-center gap-3">
                      {r.driveLink ? (
                        <a className="text-green-400 hover:underline" href={r.driveLink} target="_blank">✓ En Drive</a>
                      ) : (
                        <button className="text-amber hover:underline" disabled={!!busy}
                          onClick={() => call('drive', { id, renderId: r.id }, 'Subiendo a Google Drive…')}>↑ Subir a Drive</button>
                      )}
                      <a className="text-amber hover:underline" href={`/api/media?f=${encodeURIComponent(r.file)}`} download>Descargar</a>
                    </span>
                  </div>
                  <video src={`/api/media?f=${encodeURIComponent(r.file)}`} controls
                    className={`rounded-lg bg-black ${r.platform === 'vertical' ? 'max-h-[480px] mx-auto' : 'w-full'}`} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

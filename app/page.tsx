'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Project = { id: string; name: string; status: string; createdAt: string };

const STATUS_LABEL: Record<string, string> = {
  subido: 'Subido',
  transcripto: 'Transcripto',
  analizado: 'Analizado',
  renderizado: 'Renderizado',
};

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveInput, setDriveInput] = useState('');
  const [driveError, setDriveError] = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then(setProjects);
  }, []);

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/projects', { method: 'POST', body: form });
    const p = await res.json();
    setUploading(false);
    if (p.id) router.push(`/editor/${p.id}`);
  }

  async function importFromDrive() {
    if (!driveInput.trim()) return;
    setDriveLoading(true);
    setDriveError('');
    const res = await fetch('/api/drive-import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: driveInput.trim() }),
    });
    const p = await res.json();
    setDriveLoading(false);
    if (p.error) {
      setDriveError(p.error);
    } else if (p.id) {
      router.push(`/editor/${p.id}`);
    }
  }

  return (
    <div className="space-y-8">
      {/* Upload zone */}
      <section
        className="card border-dashed text-center py-14 cursor-pointer hover:border-amber/60 transition"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <p className="text-2xl font-bold mb-1">
          {uploading ? 'Subiendo…' : 'Tirá el video crudo acá'}
        </p>
        <p className="text-mute text-sm">MP4 / MOV · talking head, screen recording o clips largos</p>
      </section>

      {/* Drive import button */}
      <div className="flex justify-center">
        <button
          onClick={() => { setShowDriveModal(true); setDriveError(''); setDriveInput(''); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-zinc-600 hover:border-zinc-400 text-sm font-medium transition"
        >
          <svg viewBox="0 0 87.3 78" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
          Importar desde Google Drive
        </button>
      </div>

      {/* Drive modal */}
      {showDriveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">Importar desde Google Drive</h2>
            <p className="text-sm text-mute">
              Pegá el link o ID del video. El archivo debe estar compartido como{' '}
              <span className="text-amber font-medium">"Cualquiera con el enlace puede ver"</span>.
            </p>
            <input
              type="text"
              value={driveInput}
              onChange={(e) => setDriveInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && importFromDrive()}
              placeholder="https://drive.google.com/file/d/..."
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber"
              autoFocus
            />
            {driveError && (
              <p className="text-red-400 text-sm">{driveError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDriveModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-600 hover:border-zinc-400 transition"
              >
                Cancelar
              </button>
              <button
                onClick={importFromDrive}
                disabled={driveLoading || !driveInput.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-amber text-black font-semibold hover:bg-amber/80 transition disabled:opacity-50"
              >
                {driveLoading ? 'Descargando…' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projects list */}
      <section>
        <h2 className="tag mb-3">Proyectos</h2>
        {projects.length === 0 && (
          <p className="text-mute text-sm">Todavía no hay proyectos. Subí el primero arriba.</p>
        )}
        <div className="space-y-2">
          {projects.map((p) => (
            <a
              key={p.id}
              href={`/editor/${p.id}`}
              className="card flex items-center justify-between hover:border-zinc-500 transition"
            >
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-mute">{new Date(p.createdAt).toLocaleString('es-AR')}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-line">{STATUS_LABEL[p.status] || p.status}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

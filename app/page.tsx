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

  return (
    <div className="space-y-8">
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

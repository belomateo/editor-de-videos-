'use client';
import { useState, useRef, useEffect } from 'react';

export type EditAction =
  | { tipo: 'agregar_corte'; start: number; end: number; razon: string }
  | { tipo: 'quitar_corte'; index: number }
  | { tipo: 'ajustar_corte'; index: number; start: number; end: number }
  | { tipo: 'agregar_zoom'; start: number; end: number; scale: number; razon: string }
  | { tipo: 'quitar_zoom'; index: number }
  | { tipo: 'set_color'; color: string }
  | { tipo: 'set_encuadre'; framing: 'auto' | 'left' | 'center' | 'right' }
  | { tipo: 'set_formato'; platform: 'vertical' | 'horizontal' };

type Msg = { role: 'user' | 'assistant'; content: string };

type Props = {
  projectId: string;
  estado: {
    cortes: any[];
    zooms: any[];
    color: string;
    framing: string;
    platform: string;
  };
  onApplyActions: (actions: EditAction[]) => void;
};

const SUGGESTIONS = [
  'Sacá los primeros 10 segundos',
  'Agregá un zoom cuando hablo del precio',
  'Poné los subtítulos en amarillo',
  'Cambiá a formato horizontal',
];

export default function EditChat({ projectId, estado, onApplyActions }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/chat-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          instruccion: text.trim(),
          estado,
          historial: messages.slice(-6), // últimas 3 idas y vueltas de contexto
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${data.error}` }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: data.respuesta }]);
        if (data.acciones?.length) {
          onApplyActions(data.acciones);
        }
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ Error: ${e.message}` }]);
    }
    setBusy(false);
  }

  return (
    <section className="card border-amber/40">
      <h2 className="tag mb-2">💬 Editá hablándole a la IA</h2>
      <p className="text-xs text-mute mb-3">
        Pedile cambios en lenguaje natural y los aplica sobre el timeline. Ej: "sacá el bache del minuto 2", "meté un zoom cuando explico el truco".
      </p>

      <div ref={scrollRef} className="space-y-2 max-h-72 overflow-auto mb-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => send(s)}
                className="text-xs px-2.5 py-1.5 rounded-full border border-line text-mute hover:border-amber/60 hover:text-zinc-200 transition">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] text-sm px-3 py-2 rounded-lg ${
              m.role === 'user' ? 'bg-amber text-black' : 'bg-ink border border-line text-zinc-200'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-ink border border-line text-mute text-sm px-3 py-2 rounded-lg animate-pulse">
              Pensando…
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder="Pedile un cambio… (Enter para mandar)"
          disabled={busy}
          className="flex-1 bg-ink border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-amber/60"
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()}
          className="btn btn-amber !py-2 disabled:opacity-50">
          Mandar
        </button>
      </div>
    </section>
  );
}

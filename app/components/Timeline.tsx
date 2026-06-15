'use client';
import { useRef, useState, useEffect } from 'react';

export type Cut = { start: number; end: number; razon: string };

type Props = {
  duration: number;
  cuts: Cut[];
  enabledCuts: boolean[];
  currentTime: number;
  onSeek: (time: number) => void;
  onToggleCut: (index: number) => void;
  onUpdateCut: (index: number, start: number, end: number) => void;
  onPreviewCut: (index: number) => void;
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${ms}`;
};

export default function Timeline({
  duration,
  cuts,
  enabledCuts,
  currentTime,
  onSeek,
  onToggleCut,
  onUpdateCut,
  onPreviewCut,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ index: number; edge: 'start' | 'end' } | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Tiempo total que se va a eliminar
  const cutTime = cuts.reduce((acc, c, i) => acc + (enabledCuts[i] ? c.end - c.start : 0), 0);
  const finalDuration = duration - cutTime;

  function pctToTime(pct: number) {
    return Math.max(0, Math.min(duration, (pct / 100) * duration));
  }

  function handleTrackClick(e: React.MouseEvent) {
    if (dragging) return;
    const rect = trackRef.current!.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    onSeek(pctToTime(pct));
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const rect = trackRef.current!.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const time = Math.max(0, Math.min(duration, (pct / 100) * duration));
      const cut = cuts[dragging!.index];
      if (dragging!.edge === 'start') {
        onUpdateCut(dragging!.index, Math.min(time, cut.end - 0.1), cut.end);
      } else {
        onUpdateCut(dragging!.index, cut.start, Math.max(time, cut.start + 0.1));
      }
    }
    function onUp() { setDragging(null); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, cuts, duration, onUpdateCut]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span className="text-mute">
            Duración original: <span className="text-zinc-300 font-mono">{fmt(duration)}</span>
          </span>
          <span className="text-mute">
            Después de cortes: <span className="text-amber font-mono font-bold">{fmt(finalDuration)}</span>
          </span>
          <span className="text-green-400 text-xs">
            −{fmt(cutTime)} ({Math.round((cutTime / duration) * 100)}%)
          </span>
        </div>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        onMouseMove={(e) => {
          const rect = trackRef.current!.getBoundingClientRect();
          setHoverTime(pctToTime(((e.clientX - rect.left) / rect.width) * 100));
        }}
        onMouseLeave={() => setHoverTime(null)}
        className="relative h-16 bg-ink border border-line rounded-lg cursor-pointer overflow-hidden select-none"
      >
        {/* Segmentos que se mantienen (verde tenue de fondo) */}
        <div className="absolute inset-0 bg-zinc-800/40" />

        {/* Cortes marcados */}
        {cuts.map((c, i) => {
          const left = (c.start / duration) * 100;
          const width = ((c.end - c.start) / duration) * 100;
          const enabled = enabledCuts[i] ?? true;
          return (
            <div
              key={i}
              className={`absolute top-0 bottom-0 group ${enabled ? 'bg-red-500/30 border-x border-red-500/60' : 'bg-zinc-600/20 border-x border-zinc-600/40'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={(e) => { e.stopPropagation(); onPreviewCut(i); }}
              title={`${c.razon} (${fmt(c.start)} → ${fmt(c.end)})`}
            >
              {/* Handle izquierdo */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-400 opacity-0 group-hover:opacity-100 cursor-ew-resize hover:bg-red-300"
                onMouseDown={(e) => { e.stopPropagation(); setDragging({ index: i, edge: 'start' }); }}
              />
              {/* Handle derecho */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 bg-red-400 opacity-0 group-hover:opacity-100 cursor-ew-resize hover:bg-red-300"
                onMouseDown={(e) => { e.stopPropagation(); setDragging({ index: i, edge: 'end' }); }}
              />
              {enabled && width > 3 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-red-200 font-mono pointer-events-none">
                  ✂
                </span>
              )}
            </div>
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber z-10 pointer-events-none"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        >
          <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-amber rounded-full" />
        </div>

        {/* Hover indicator */}
        {hoverTime !== null && !dragging && (
          <div
            className="absolute top-0 bottom-0 w-px bg-zinc-400/50 pointer-events-none z-20"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          >
            <span className="absolute -top-6 left-1 text-[10px] font-mono text-zinc-400 whitespace-nowrap bg-ink px-1 rounded">
              {fmt(hoverTime)}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-mute">
        Hacé click en la barra para mover el cursor · click en un corte rojo para previsualizarlo · arrastrá los bordes de un corte para ajustarlo
      </p>
    </div>
  );
}

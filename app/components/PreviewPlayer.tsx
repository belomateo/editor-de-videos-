'use client';
import { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';

export type Cut = { start: number; end: number; razon: string };

type Props = {
  src: string;
  cuts: Cut[];
  enabledCuts: boolean[];
  previewMode: boolean; // si true, salta los cortes al reproducir
  onTimeUpdate: (t: number) => void;
};

export type PreviewHandle = {
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  previewCut: (start: number, end: number) => void;
};

const PreviewPlayer = forwardRef<PreviewHandle, Props>(
  ({ src, cuts, enabledCuts, previewMode, onTimeUpdate }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);

    // Lista ordenada de cortes activos
    const activeCuts = cuts
      .map((c, i) => ({ ...c, enabled: enabledCuts[i] ?? true }))
      .filter((c) => c.enabled)
      .sort((a, b) => a.start - b.start);

    useImperativeHandle(ref, () => ({
      seek: (t: number) => {
        if (videoRef.current) videoRef.current.currentTime = t;
      },
      play: () => videoRef.current?.play(),
      pause: () => videoRef.current?.pause(),
      previewCut: (start: number, end: number) => {
        if (!videoRef.current) return;
        // Saltar a 1.5s antes del corte para ver el contexto
        videoRef.current.currentTime = Math.max(0, start - 1.5);
        videoRef.current.play();
      },
    }));

    // En modo preview, saltar los cortes automáticamente
    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;

      function onTime() {
        const t = v!.currentTime;
        onTimeUpdate(t);

        if (previewMode) {
          // Si entramos en un corte activo, saltar al final
          for (const cut of activeCuts) {
            if (t >= cut.start && t < cut.end) {
              v!.currentTime = cut.end + 0.05;
              break;
            }
          }
        }
      }

      v.addEventListener('timeupdate', onTime);
      return () => v.removeEventListener('timeupdate', onTime);
    }, [previewMode, activeCuts, onTimeUpdate]);

    return (
      <div className="relative">
        <video
          ref={videoRef}
          src={src}
          controls
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="w-full max-h-[420px] rounded-xl bg-black"
        />
        {previewMode && (
          <div className="absolute top-3 left-3 bg-amber text-black text-xs font-bold px-2 py-1 rounded-md">
            ▶ PREVIEW (con cortes aplicados)
          </div>
        )}
      </div>
    );
  }
);

PreviewPlayer.displayName = 'PreviewPlayer';
export default PreviewPlayer;

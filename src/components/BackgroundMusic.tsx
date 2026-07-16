import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// URL da faixa MPB instrumental — substituir por um link direto para um MP3 royalty-free.
// Ex.: Pixabay Music, Free Music Archive, ccMixter. Deve terminar em .mp3
export const MPB_TRACK_URL =
  "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3";

const STORAGE_PLAYING = "domus-bgm-playing";
const STORAGE_VOLUME = "domus-bgm-volume";

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);

  // Load persisted state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(STORAGE_VOLUME);
    if (v) setVolume(Math.max(0, Math.min(1, Number(v))));
    const p = localStorage.getItem(STORAGE_PLAYING);
    if (p === "1") setPlaying(true);
    setReady(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_VOLUME, String(volume));
    localStorage.setItem(STORAGE_PLAYING, playing ? "1" : "0");
  }, [playing, volume, ready]);

  // Apply volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Play/pause
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.play().catch(() => {
        // Autoplay bloqueado — requer gesto do utilizador
        setPlaying(false);
      });
    } else {
      el.pause();
    }
  }, [playing]);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-2 shadow-lg backdrop-blur-md">
      <audio ref={audioRef} src={MPB_TRACK_URL} loop preload="none" />
      <button
        type="button"
        aria-label={playing ? "Pausar música" : "Tocar música MPB"}
        onClick={() => setPlaying((p) => !p)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/80 hover:bg-accent hover:text-foreground transition"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <button
        type="button"
        aria-label="Ajustar volume"
        onClick={() => setExpanded((e) => !e)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 hover:bg-accent hover:text-foreground transition"
      >
        <Music className="h-4 w-4" />
      </button>

      {expanded && (
        <div className="flex items-center gap-2 pl-1">
          <button
            type="button"
            aria-label={volume === 0 ? "Ativar som" : "Silenciar"}
            onClick={() => setVolume(volume === 0 ? 0.35 : 0)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/70 hover:bg-accent"
          >
            {volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <Slider
            value={[Math.round(volume * 100)]}
            max={100}
            step={1}
            onValueChange={(v) => setVolume((v[0] ?? 0) / 100)}
            className="w-28"
            aria-label="Volume da música de fundo"
          />
        </div>
      )}
    </div>
  );
}

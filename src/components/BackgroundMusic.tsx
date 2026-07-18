import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { MPB_TRACK_URL, ensureBackgroundMusic } from "@/lib/bgm";

export { MPB_TRACK_URL };

const STORAGE_PLAYING = "domus-bgm-playing";
const STORAGE_VOLUME = "domus-bgm-volume";

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);

  // Adopta (ou cria) o elemento global e restaura preferências
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(STORAGE_VOLUME);
    const vol = v ? Math.max(0, Math.min(1, Number(v))) : 0.35;
    setVolume(vol);
    const p = localStorage.getItem(STORAGE_PLAYING);
    const shouldPlay = p === null ? true : p === "1";
    setPlaying(shouldPlay);
    // Reusa o <audio> desbloqueado no login, ou cria um novo
    const el = ensureBackgroundMusic(vol);
    if (el) {
      audioRef.current = el;
      el.volume = vol;
      if (shouldPlay) void el.play().catch(() => {});
      else el.pause();
    }
    setReady(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_VOLUME, String(volume));
    localStorage.setItem(STORAGE_PLAYING, playing ? "1" : "0");
  }, [playing, volume, ready]);

  // Aplica volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Play/pause com fallback para primeiro gesto
  useEffect(() => {
    if (!ready) return;
    const el = audioRef.current;
    if (!el) return;
    if (!playing) {
      el.pause();
      return;
    }
    el.play().catch(() => {
      const resume = () => {
        el.play().catch(() => {});
      };
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
      window.addEventListener("touchstart", resume, { once: true });
    });
  }, [playing, ready]);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-2 shadow-lg backdrop-blur-md">
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

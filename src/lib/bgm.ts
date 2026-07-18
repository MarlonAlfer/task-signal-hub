import mpbTrack from "@/assets/mpb-background.mp3.asset.json";

export const MPB_TRACK_URL = mpbTrack.url;

declare global {
  interface Window {
    __domusBgm?: HTMLAudioElement;
  }
}

/** Cria (uma vez) o <audio> global e começa a pré-carregar. Chame no mount da tela de login. */
export function preloadBackgroundMusic(volume = 0.35): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!window.__domusBgm) {
    const el = new Audio(MPB_TRACK_URL);
    el.loop = true;
    el.preload = "auto";
    el.volume = volume;
    el.crossOrigin = "anonymous";
    // força o buffer
    try { el.load(); } catch { /* noop */ }
    window.__domusBgm = el;
  }
  return window.__domusBgm;
}

/** Deve ser chamado a partir de um gesto do utilizador (ex.: submit do login). */
export function ensureBackgroundMusic(volume = 0.35): HTMLAudioElement | null {
  const el = preloadBackgroundMusic(volume);
  if (el) void el.play().catch(() => {});
  return el;
}


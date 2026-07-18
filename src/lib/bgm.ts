import mpbTrack from "@/assets/mpb-background.mp3.asset.json";

export const MPB_TRACK_URL = mpbTrack.url;

declare global {
  interface Window {
    __domusBgm?: HTMLAudioElement;
  }
}

/**
 * Cria (uma única vez) o elemento <audio> global da trilha e tenta tocar.
 * Deve ser chamado a partir de um gesto do utilizador (ex.: submit do login)
 * para desbloquear o autoplay do navegador.
 */
export function ensureBackgroundMusic(volume = 0.35): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let el = window.__domusBgm;
  if (!el) {
    el = new Audio(MPB_TRACK_URL);
    el.loop = true;
    el.preload = "auto";
    el.volume = volume;
    window.__domusBgm = el;
  }
  // Tentar tocar dentro do gesto — sincronamente.
  void el.play().catch(() => {});
  return el;
}

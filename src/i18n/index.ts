import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { pt } from "./locales/pt";
import { en } from "./locales/en";
import { es } from "./locales/es";

export const SUPPORTED_LANGS = ["pt", "en", "es"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        pt: { translation: pt },
        en: { translation: en },
        es: { translation: es },
      },
      fallbackLng: "pt",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
        lookupLocalStorage: "domus-lang",
      },
      react: { useSuspense: false },
    });
}

export const LOCALE_MAP: Record<Lang, string> = {
  pt: "pt-PT",
  en: "en-US",
  es: "es-ES",
};

export function currentLocale(): string {
  const lng = (i18n.language || "pt").slice(0, 2) as Lang;
  return LOCALE_MAP[lng] ?? "pt-PT";
}

export default i18n;

import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Languages } from "lucide-react";
import { SUPPORTED_LANGS, type Lang } from "@/i18n";

const FLAGS: Record<Lang, string> = { pt: "🇵🇹", en: "🇬🇧", es: "🇪🇸" };

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.language?.slice(0, 2) as Lang) || "pt";
  return (
    <Select value={current} onValueChange={(v) => i18n.changeLanguage(v)}>
      <SelectTrigger
        aria-label={t("common.language")}
        className={compact ? "h-8 w-[92px] px-2 gap-1 text-xs" : "h-9 w-[130px]"}
      >
        <Languages className="h-3.5 w-3.5 opacity-70" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGS.map((l) => (
          <SelectItem key={l} value={l}>
            <span className="flex items-center gap-2">
              <span>{FLAGS[l]}</span>
              <span className="uppercase">{l}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

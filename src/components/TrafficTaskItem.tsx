import { cn } from "@/lib/utils";
import { Check, Circle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CompletionStatus } from "@/lib/types";

interface Props {
  status: CompletionStatus;
  title: string;
  group?: string | null;
  disabled?: boolean;
  onCycle: () => void;
  onComplete: () => void;
}

export function TrafficTaskItem({ status, title, group, disabled, onCycle, onComplete }: Props) {
  const { t } = useTranslation();
  const cls =
    status === "done" ? "traffic-green"
    : status === "in_progress" ? "traffic-yellow"
    : "traffic-red";

  const label =
    status === "done" ? t("status.done")
    : status === "in_progress" ? t("status.inProgress")
    : t("status.pending");

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCycle}
      onDoubleClick={onComplete}
      className={cn(
        "w-full text-left rounded-lg px-3 sm:px-4 py-3 flex items-start gap-2.5 sm:gap-3 transition-all",
        "hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-70",
        cls
      )}
      aria-label={`${title} — ${label}`}
    >
      <span className="mt-0.5 shrink-0">
        {status === "done" ? <Check className="h-5 w-5 text-status-green" />
        : status === "in_progress" ? <Loader2 className="h-5 w-5 text-status-yellow animate-spin" style={{ animationDuration: "3s" }} />
        : <Circle className="h-5 w-5 text-status-red" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-medium break-words", status === "done" && "line-through opacity-80")}>
          {title}
        </span>
        {group && <span className="block text-xs text-muted-foreground mt-0.5">{group}</span>}
      </span>
      <span className="hidden shrink-0 text-xs uppercase tracking-wide font-semibold opacity-80 sm:inline">{label}</span>
    </button>
  );
}

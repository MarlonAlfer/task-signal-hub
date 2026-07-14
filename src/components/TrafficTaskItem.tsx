import { cn } from "@/lib/utils";
import { Check, Circle, Loader2 } from "lucide-react";
import type { CompletionStatus } from "@/lib/types";

interface Props {
  status: CompletionStatus;
  title: string;
  group?: string | null;
  disabled?: boolean;
  onCycle: () => void; // single click: pending<->in_progress
  onComplete: () => void; // double click: mark done
}

export function TrafficTaskItem({ status, title, group, disabled, onCycle, onComplete }: Props) {
  const cls =
    status === "done" ? "traffic-green"
    : status === "in_progress" ? "traffic-yellow"
    : "traffic-red";

  const label =
    status === "done" ? "Concluída"
    : status === "in_progress" ? "Em andamento"
    : "Pendente";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCycle}
      onDoubleClick={onComplete}
      className={cn(
        "w-full text-left rounded-lg px-4 py-3 flex items-start gap-3 transition-all",
        "hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-70",
        cls
      )}
      aria-label={`${title} — ${label}`}
    >
      <span className="mt-0.5">
        {status === "done" ? <Check className="h-5 w-5 text-status-green" />
        : status === "in_progress" ? <Loader2 className="h-5 w-5 text-status-yellow animate-spin" style={{ animationDuration: "3s" }} />
        : <Circle className="h-5 w-5 text-status-red" />}
      </span>
      <span className="flex-1">
        <span className={cn("block font-medium", status === "done" && "line-through opacity-80")}>
          {title}
        </span>
        {group && <span className="block text-xs text-muted-foreground mt-0.5">{group}</span>}
      </span>
      <span className="text-xs uppercase tracking-wide font-semibold opacity-80">{label}</span>
    </button>
  );
}

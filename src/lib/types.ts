export type CompletionStatus = "pending" | "in_progress" | "done";

export interface TaskRow {
  id: string;
  title: string;
  category: "diaria" | "semanal" | "quinzenal" | "mensal" | "semestral";
  weekday: number | null;
  group_label: string | null;
  position: number;
  active: boolean;
}

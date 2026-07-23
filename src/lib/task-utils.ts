// Weekday helpers: JS Sunday=0..Saturday=6; our schema uses 1=Mon..6=Sat, null for others.
import i18n from "@/i18n";

// Kept as accessors so components reading these constants stay reactive to language changes.
export const WEEKDAY_LABELS: Record<number, string> = new Proxy(
  {},
  {
    get(_t, key: string) {
      return i18n.t(`weekday.${key}`);
    },
  },
) as Record<number, string>;

export const CATEGORY_LABELS: Record<string, string> = new Proxy(
  {
    diaria: "",
    semanal: "",
    quinzenal: "",
    mensal: "",
    semestral: "",
  } as Record<string, string>,
  {
    get(_t, key: string) {
      // Only translate known keys; Object.entries still works because ownKeys is not trapped.
      const known = ["diaria", "semanal", "quinzenal", "mensal", "semestral"];
      if (known.includes(key)) return i18n.t(`category.${key}`);
      return undefined;
    },
    ownKeys() {
      return ["diaria", "semanal", "quinzenal", "mensal", "semestral"];
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);

export function todayWeekday(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 0 : jsDay;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isFriday(): boolean {
  return new Date().getDay() === 5;
}

export function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function isTaskDueToday(task: { category: string; weekday: number | null }): boolean {
  const wd = todayWeekday();
  if (wd === 0) return false;
  switch (task.category) {
    case "diaria":
      return true;
    case "semanal":
      return task.weekday === wd;
    case "quinzenal":
    case "mensal":
    case "semestral":
      return true;
    default:
      return false;
  }
}

export function isFirstBusinessDayOfMonth(): boolean {
  const now = new Date();
  const day = now.getDate();
  const jsDow = now.getDay();
  if (jsDow === 0) return false;
  if (day === 1) return true;
  if (day === 2) {
    const firstDow = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    return firstDow === 0;
  }
  return false;
}

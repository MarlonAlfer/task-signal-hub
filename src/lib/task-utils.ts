// Weekday helpers: JS Sunday=0..Saturday=6; our schema uses 1=Mon..6=Sat, null for others.
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

export const CATEGORY_LABELS: Record<string, string> = {
  diaria: "Tarefas Diárias",
  semanal: "Tarefas Semanais",
  quinzenal: "Tarefas Quinzenais",
  mensal: "Tarefas Mensais",
  semestral: "Tarefas Semestrais",
};

export function todayWeekday(): number {
  // Convert JS 0..6 (Sun..Sat) to our 1..6 (Mon..Sat); Sunday -> 0 (no tasks)
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
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// A task is due today if:
// - category=diaria (every day Mon-Sat) — but we hide on Sunday
// - category=semanal and weekday matches today
// - category=mensal on the 1st business day of the month? Keep simple: due every day of the current month until done
// - quinzenal/semestral: due every day until completed within its window
export function isTaskDueToday(task: { category: string; weekday: number | null }): boolean {
  const wd = todayWeekday();
  if (wd === 0) return false; // Sunday — nothing due
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

// Returns true if today is the first business day (Mon-Sat) of the current month.
export function isFirstBusinessDayOfMonth(): boolean {
  const now = new Date();
  const day = now.getDate();
  const jsDow = now.getDay(); // 0=Sun..6=Sat
  if (jsDow === 0) return false; // Sunday never counts
  // First business day = smallest date in month whose weekday != Sunday
  // If today is 1st and not Sunday => yes
  // If today is 2nd and 1st was Sunday => yes
  if (day === 1) return true;
  if (day === 2) {
    const firstDow = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    return firstDow === 0;
  }
  return false;
}


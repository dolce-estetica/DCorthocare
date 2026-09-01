import { dayKey, todayKey, istStartOfDay, istEndOfDay, fyOf } from "@/lib/format";

export type Period = "today" | "week" | "month" | "fy" | "all" | "custom";

/* Weekday of an already-resolved IST calendar date. The calendar date is fixed,
   so anchoring it at UTC noon gives a deterministic weekday no matter what
   timezone the server runs in. */
function mondayOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const dow = (anchor.getUTCDay() + 6) % 7; // Monday = 0
  anchor.setUTCDate(anchor.getUTCDate() - dow);
  return anchor.toISOString().slice(0, 10);
}

export function weekKey(d: Date | string) {
  return mondayOf(dayKey(d));
}

export function resolveRange(p: Period, from?: string, to?: string): { from: Date; to: Date; label: string } {
  const tk = todayKey();
  const [Y, M] = tk.split("-").map(Number);
  const allEnd = istEndOfDay(tk);
  const allStart = new Date(2000, 0, 1);

  switch (p) {
    case "today":
      return { from: istStartOfDay(tk), to: allEnd, label: `Today (${tk})` };
    case "week": {
      const monKey = mondayOf(tk);
      return { from: istStartOfDay(monKey), to: allEnd, label: `This week (from ${monKey})` };
    }
    case "month":
      return {
        from: istStartOfDay(`${Y}-${String(M).padStart(2, "0")}-01`),
        to: allEnd,
        label: `Month ${Y}-${String(M).padStart(2, "0")}`,
      };
    case "fy": {
      const fy = fyOf();
      const y = Number(fy.slice(0, 4));
      return { from: istStartOfDay(`${y}-04-01`), to: allEnd, label: `FY ${fy}` };
    }
    case "custom":
      return {
        from: istStartOfDay(from || `${Y}-01-01`),
        to: istEndOfDay(to || tk),
        label: `${from || "…"} → ${to || tk}`,
      };
    default:
      return { from: allStart, to: allEnd, label: "All time" };
  }
}

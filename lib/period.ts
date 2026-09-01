import { dayKey, todayKey, istStartOfDay, istEndOfDay, fyOf } from "@/lib/format";

export type Period = "today" | "week" | "month" | "fy" | "all" | "custom";

export function resolveRange(p: Period, from?: string, to?: string): { from: Date; to: Date; label: string } {
  const tk = todayKey();
  const [Y, M, D] = tk.split("-").map(Number);
  const allEnd = istEndOfDay(tk);
  const allStart = new Date(2000, 0, 1);

  switch (p) {
    case "today":
      return { from: istStartOfDay(tk), to: allEnd, label: `Today (${tk})` };
    case "week": {
      // Monday-start week, IST
      const now = new Date();
      const wd = Number(new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }).format(now));
      const dow = (new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay() + 6) % 7;
      const mon = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      mon.setDate(mon.getDate() - dow);
      const monKey = dayKey(mon);
      return { from: istStartOfDay(monKey), to: allEnd, label: `This week (from ${monKey})` };
    }
    case "month":
      return { from: istStartOfDay(`${Y}-${String(M).padStart(2, "0")}-01`), to: allEnd, label: `Month ${Y}-${String(M).padStart(2, "0")}` };
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

export function weekKey(d: Date | string) {
  const dt = new Date(new Date(d).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const dow = (dt.getDay() + 6) % 7; // Monday = 0
  dt.setDate(dt.getDate() - dow);
  return dayKey(dt);
}

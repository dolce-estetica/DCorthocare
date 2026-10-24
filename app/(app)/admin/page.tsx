import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money, money0, dayKey, R } from "@/lib/format";
import { resolveRange, weekKey, Period } from "@/lib/period";
import PageHeader from "../PageHeader";

export const dynamic = "force-dynamic";

type DocBill = {
  date: string;
  type?: string;
  gross: number;
  disc: number;
  net: number;
  tv?: number;
  cgst?: number;
  sgst?: number;
  payments?: { d: string; mode: string; amt: number; ref?: string }[];
  doctorId?: string;
  patientId?: string;
  pname?: string;
  cancelled?: boolean;
  lines?: { sid?: string; name?: string; amt: number }[];
};
type DocExpense = { id?: string; date: string; head?: string; desc?: string; amount: number; capex?: boolean; mode?: string };
type DocStockItem = { id: string; name: string; unit?: string; rate?: number; min?: number; opening?: number; cat?: string };
type DocStockMove = { itemId: string; date: string; qty: number; rate?: number; type: string };

/* day-key arithmetic anchored at UTC noon so IST dates stay stable */
const keyToDate = (k: string) => new Date(`${k}T12:00:00Z`);
const shiftKey = (k: string, days: number) => {
  const d = keyToDate(k);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/clinic");

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string)) || "";
  const p = (one("p") || "month") as Period;
  const pro = one("pro");
  const fromS = one("from");
  const toS = one("to");

  const row = await prisma.appState.findUnique({ where: { id: "clinic" } });
  const doc: any = row?.data || {};
  const allBills: DocBill[] = Array.isArray(doc.bills) ? doc.bills : [];
  const allExpenses: DocExpense[] = Array.isArray(doc.expenses) ? doc.expenses : [];
  const stockItems: DocStockItem[] = Array.isArray(doc.stockItems) ? doc.stockItems : [];
  const stockMoves: DocStockMove[] = Array.isArray(doc.stockMoves) ? doc.stockMoves : [];
  const patientsAll: any[] = Array.isArray(doc.patients) ? doc.patients : [];
  const doctors: any[] = Array.isArray(doc.doctors) ? doc.doctors : [];
  const services: any[] = Array.isArray(doc.services) ? doc.services : [];

  const range = resolveRange(p, fromS, toS);
  const fromKey = dayKey(range.from);
  const toKey = dayKey(range.to);

  /* the comparison window: the equal-length stretch of days just before this one */
  const nDays = Math.round((keyToDate(toKey).getTime() - keyToDate(fromKey).getTime()) / 86400000) + 1;
  const prevToKey = shiftKey(fromKey, -1);
  const prevFromKey = shiftKey(prevToKey, -(nDays - 1));
  const hasPrev = prevFromKey >= "2000-01-01" && p !== "all";

  const proName = (id?: string) => {
    const d = doctors.find((x) => x.id === id);
    return d ? d.name : "Front desk / unattributed";
  };
  const proKind = (id?: string) => {
    const d = doctors.find((x) => x.id === id);
    return d ? d.kind || "doctor" : "staff";
  };
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const proMatch = (b: DocBill) => !pro || (pro === "none" ? !b.doctorId : b.doctorId === pro);

  const window = (a: string, b: string) => {
    const bs = allBills.filter((x) => !x.cancelled && inRange(x.date, a, b) && proMatch(x));
    const pays = bs.flatMap((x) => (x.payments || []).map((y) => ({ ...y, bill: x })));
    const ex = allExpenses.filter((x) => inRange(x.date, a, b));
    return {
      bills: bs,
      pays,
      ex,
      billed: R(bs.reduce((s, x) => s + x.net, 0)),
      collected: R(pays.reduce((s, x) => s + x.amt, 0)),
      expenses: R(ex.reduce((s, x) => s + (Number(x.amount) || 0), 0)),
      newPatients: patientsAll.filter((x) => inRange(x.created || "", a, b)).length,
    };
  };

  const cur = window(fromKey, toKey);
  const prev = hasPrev ? window(prevFromKey, prevToKey) : null;

  const pct = (now: number, before: number) => {
    if (!prev) return null;
    if (before === 0) return now > 0 ? "new" : null;
    return R(((now - before) / before) * 100);
  };
  const delta = (v: number | "new" | null) => {
    if (v === null) return <span className="d">—</span>;
    if (v === "new") return <span className="d" style={{ color: "var(--ok)" }}>new</span>;
    const up = v >= 0;
    return (
      <span className="d" style={{ color: up ? "var(--ok)" : "var(--bad)" }}>
        {up ? "▲" : "▼"} {Math.abs(v)}% <span style={{ color: "var(--ink3)" }}>vs previous {nDays} days</span>
      </span>
    );
  };

  const pending = R(
    allBills
      .filter((b) => !b.cancelled && b.date <= toKey && proMatch(b))
      .reduce((s, b) => s + b.net - (b.payments || []).reduce((t, x) => t + x.amt, 0), 0)
  );
  const avg = cur.bills.length ? cur.billed / cur.bills.length : 0;
  const profit = R(cur.collected - cur.expenses);
  const prevProfit = prev ? R(prev.collected - prev.expenses) : 0;
  const overhead = cur.collected > 0 ? R((cur.expenses / cur.collected) * 100) : 0;
  const distinctPatients = new Set(cur.bills.map((b) => b.patientId || b.pname)).size;
  const cashAmt = cur.pays.filter((x) => x.mode === "Cash").reduce((s, x) => s + x.amt, 0);
  const cashShare = cur.collected > 0 ? (cashAmt / cur.collected) * 100 : 0;
  const capex = R(cur.ex.filter((x) => x.capex).reduce((s, x) => s + x.amount, 0));

  /* day-by-day table + bars */
  const dayMap = new Map<string, { billed: number; bills: number; collected: number; expenses: number; np: number }>();
  const blank = (k: string) => dayMap.get(k) || { billed: 0, bills: 0, collected: 0, expenses: 0, np: 0 };
  cur.bills.forEach((b) => {
    const e = blank(b.date); e.billed += b.net; e.bills++; dayMap.set(b.date, e);
  });
  cur.pays.forEach((x) => {
    const e = blank(x.d); e.collected += x.amt; dayMap.set(x.d, e);
  });
  cur.ex.forEach((x) => {
    const e = blank(x.date); e.expenses += Number(x.amount) || 0; dayMap.set(x.date, e);
  });
  patientsAll.forEach((x) => {
    if (inRange(x.created || "", fromKey, toKey)) {
      const e = blank(x.created); e.np++; dayMap.set(x.created, e);
    }
  });
  const dayRows = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 60);
  const bars = dayRows.slice().reverse().slice(-35);
  const maxDay = Math.max(1, ...bars.map(([, v]) => v.billed));
  const dayRevAvg = dayRows.length ? cur.billed / dayRows.length : 0;

  /* month trend — last 12 months */
  const tk = toKey;
  const months: string[] = [];
  {
    const [y, m] = tk.split("-").map(Number);
    let cy = y, cm = m;
    for (let i = 11; i >= 0; i--) {
      months.push(`${cy}-${String(cm).padStart(2, "0")}`);
      cm--; if (cm === 0) { cm = 12; cy--; }
    }
  }
  const monthStats = months.map((mkey) => {
    const bs = allBills.filter((x) => !x.cancelled && x.date.startsWith(mkey) && proMatch(x));
    const pays = bs.flatMap((x) => x.payments || []);
    const ex = allExpenses.filter((x) => x.date.startsWith(mkey));
    return {
      mkey,
      billed: R(bs.reduce((s, x) => s + x.net, 0)),
      collected: R(pays.reduce((s, x) => s + x.amt, 0)),
      expenses: R(ex.reduce((s, x) => s + (Number(x.amount) || 0), 0)),
      bills: bs.length,
      np: patientsAll.filter((x) => (x.created || "").startsWith(mkey)).length,
    };
  });
  const activeMonths = monthStats.filter((m) => m.billed > 0 || m.expenses > 0);
  const maxMonth = Math.max(1, ...monthStats.map((m) => Math.max(m.billed, m.expenses)));
  const lastGrowth = (() => {
    const n = monthStats.length;
    if (n < 2) return null;
    const a = monthStats[n - 2].billed, b = monthStats[n - 1].billed;
    if (a === 0) return null;
    return R(((b - a) / a) * 100);
  })();

  /* stock value at cost (last purchase rate), low stock count */
  const qtyOf = (id: string) => {
    const it = stockItems.find((x) => x.id === id);
    if (!it) return 0;
    let q = Number(it.opening) || 0;
    stockMoves.forEach((mv) => { if (mv.itemId === id) q += mv.type === "in" ? mv.qty : -mv.qty; });
    return q;
  };
  const costOf = (id: string) => {
    const ins = stockMoves.filter((mv) => mv.itemId === id && mv.type === "in" && mv.rate);
    const it = stockItems.find((x) => x.id === id);
    return ins.length ? ins[ins.length - 1].rate! : it?.rate || 0;
  };
  const stockRows = stockItems
    .map((it) => ({ name: it.name, unit: it.unit || "pcs", qty: qtyOf(it.id), cost: costOf(it.id), min: it.min || 0, cat: it.cat || "" }))
    .map((r) => ({ ...r, value: R(r.qty * r.cost) }))
    .sort((a, b) => b.value - a.value);
  const stockValue = R(stockRows.reduce((s, r) => s + r.value, 0));
  const lowStock = stockRows.filter((r) => r.qty <= r.min);

  /* expenses by head */
  const byHead = new Map<string, number>();
  cur.ex.forEach((x) => byHead.set(x.head || "Other", (byHead.get(x.head || "Other") || 0) + (Number(x.amount) || 0)));
  const heads = [...byHead.entries()].sort((a, b) => b[1] - a[1]);
  const maxHead = Math.max(1, ...heads.map((h) => h[1]));

  /* categories & services */
  const svcCat = (sid?: string) => services.find((x) => x.id === sid)?.cat || "Other";
  const byCat = new Map<string, number>();
  const bySvc = new Map<string, { amount: number; n: number }>();
  cur.bills.forEach((b) =>
    (b.lines || []).forEach((l) => {
      const c = svcCat(l.sid);
      byCat.set(c, (byCat.get(c) || 0) + l.amt);
      const e = bySvc.get(l.name || c) || { amount: 0, n: 0 };
      e.amount += l.amt; e.n++;
      bySvc.set(l.name || c, e);
    })
  );
  const catTotal = [...byCat.values()].reduce((s, v) => s + v, 0);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const topSvc = [...bySvc.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);

  /* payment modes */
  const MODES = ["Cash", "UPI", "Card", "Bank transfer", "Cheque"];
  const byMode = new Map<string, number>();
  cur.pays.forEach((x) => byMode.set(x.mode, (byMode.get(x.mode) || 0) + x.amt));

  /* by professional */
  type ProRow = { name: string; kind: string; bills: number; billed: number; collected: number };
  const byPro = new Map<string, ProRow>();
  cur.bills.forEach((b) => {
    const k = b.doctorId || "_none";
    const e = byPro.get(k) || { name: proName(b.doctorId), kind: proKind(b.doctorId), bills: 0, billed: 0, collected: 0 };
    e.bills++; e.billed += b.net;
    byPro.set(k, e);
  });
  cur.pays.forEach((x) => {
    const e = byPro.get(x.bill.doctorId || "_none");
    if (e) e.collected += x.amt;
  });

  /* by week */
  const byWeek = new Map<string, { bills: number; billed: number; collected: number }>();
  cur.bills.forEach((b) => {
    const k = weekKey(b.date + "T12:00:00+05:30");
    const w = byWeek.get(k) || { bills: 0, billed: 0, collected: 0 };
    w.bills++; w.billed += b.net;
    byWeek.set(k, w);
  });
  cur.pays.forEach((x) => {
    const k = weekKey(x.d + "T12:00:00+05:30");
    const w = byWeek.get(k) || { bills: 0, billed: 0, collected: 0 };
    w.collected += x.amt;
    byWeek.set(k, w);
  });
  const weeks = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const pills: [string, string][] = [
    ["today", "Today"],
    ["week", "This week"],
    ["month", "This month"],
    ["fy", "This FY"],
    ["all", "All time"],
  ];
  const qs = (np: string, npro: string) => {
    const q = new URLSearchParams();
    q.set("p", np);
    if (npro) q.set("pro", npro);
    if (fromS) q.set("from", fromS);
    if (toS) q.set("to", toS);
    return `/admin?${q.toString()}`;
  };
  const professionals = doctors.filter((d) => d.active !== false);

  /* plain-language summary */
  const dmy = (k: string) => {
    const [y, m, d] = k.split("-");
    return `${d}-${m}-${y}`;
  };
  const fmtDeltaWord = (v: number | "new" | null) => (typeof v === "number" ? `${Math.abs(v)}% ${v >= 0 ? "more" : "less"}` : "");
  const revDelta = pct(cur.billed, prev?.billed || 0);
  const summary = `Between ${dmy(fromKey)} and ${dmy(toKey)} the clinic billed ${money(cur.billed)} across ${cur.bills.length} bill${cur.bills.length === 1 ? "" : "s"} from ${distinctPatients} patient${distinctPatients === 1 ? "" : "s"}, and actually collected ${money(cur.collected)}. Expenses came to ${money(cur.expenses)}${capex > 0 ? ` (of which ${money(capex)} was equipment / one-time)` : ""}, so the clinic kept ${profit >= 0 ? "" : "a loss of "}${money(Math.abs(profit))} ${profit >= 0 ? "as profit" : ""}.${prev && typeof revDelta === "number" ? ` Revenue is ${fmtDeltaWord(revDelta)} than the previous ${nDays} days.` : ""} ${cur.newPatients} new patient${cur.newPatients === 1 ? "" : "s"} registered. Stock on hand is worth about ${money0(stockValue)} at cost.`;

  return (
    <>
      <PageHeader title="Accounts Dashboard" sub={`${range.label} · compared with the ${nDays} days before · from the live clinic books`}>
        <Link className="btn sm ghost" href="/clinic">Open clinic app</Link>
      </PageHeader>
      <main id="view">
        <div className="filterbar">
          {pills.map(([k, label]) => (
            <Link key={k} href={qs(k, pro)} className={"pill" + (p === k ? " on" : "")}>
              {label}
            </Link>
          ))}
          <form method="get" action="/admin">
            <input type="hidden" name="p" value="custom" />
            <div>
              <label>From</label>
              <input type="date" name="from" defaultValue={p === "custom" ? fromS || "" : ""} />
            </div>
            <div>
              <label>To</label>
              <input type="date" name="to" defaultValue={p === "custom" ? toS || "" : ""} />
            </div>
            <div>
              <label>Doctor / Physio</label>
              <select name="pro" defaultValue={pro} style={{ minWidth: 180 }}>
                <option value="">Everyone</option>
                {professionals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.kind === "physio" ? "Physio" : "Doctor"})
                  </option>
                ))}
              </select>
            </div>
            <button className="btn sm" style={{ marginTop: 19 }}>Apply</button>
          </form>
        </div>

        <div className="card pad" style={{ marginBottom: 14 }}>
          <h3>In simple words</h3>
          <div className="hint" style={{ fontSize: 14, lineHeight: 1.7 }}>{summary}</div>
        </div>

        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="kpi acc">
            <div className="l">Revenue (billed)</div>
            <div className="v">{money(cur.billed)}</div>
            {delta(pct(cur.billed, prev?.billed || 0))}
          </div>
          <div className="kpi acc">
            <div className="l">Collected (money in)</div>
            <div className="v">{money(cur.collected)}</div>
            {delta(pct(cur.collected, prev?.collected || 0))}
          </div>
          <div className="kpi">
            <div className="l">Expenses</div>
            <div className="v">{money(cur.expenses)}</div>
            {delta(pct(cur.expenses, prev?.expenses || 0))}
          </div>
          <div className="kpi">
            <div className="l">Profit (collected − expenses)</div>
            <div className="v" style={{ color: profit >= 0 ? undefined : "var(--bad)" }}>{money(profit)}</div>
            {delta(pct(profit, prevProfit))}
          </div>
        </div>
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="kpi">
            <div className="l">Bills</div>
            <div className="v">{cur.bills.length}</div>
            {delta(pct(cur.bills.length, prev?.bills.length || 0))}
          </div>
          <div className="kpi">
            <div className="l">New patients</div>
            <div className="v">{cur.newPatients}</div>
            {delta(pct(cur.newPatients, prev?.newPatients || 0))}
          </div>
          <div className="kpi">
            <div className="l">Average bill</div>
            <div className="v">{money(avg)}</div>
            <div className="d">after discount, incl. GST</div>
          </div>
          <div className="kpi">
            <div className="l">Pending dues</div>
            <div className="v">{money(pending)}</div>
            <div className="d">all bills up to {dmy(toKey)}</div>
          </div>
        </div>

        <div className="grid split" style={{ marginBottom: 14 }}>
          <div className="card pad">
            <h3>Growth trend — last 12 months</h3>
            {activeMonths.length === 0 ? (
              <div className="empty"><div className="big">🌱</div>No activity yet.</div>
            ) : (
              <>
                <div className="cols">
                  {monthStats.map((m) => (
                    <div key={m.mkey} className="colv" title={`${m.mkey} — billed ${money(m.billed)} · collected ${money(m.collected)} · expenses ${money(m.expenses)} · ${m.bills} bills · ${m.np} new patients`}>
                      <b>{money0(m.billed)}</b>
                      <i style={{ height: `${Math.max(3, (m.billed / maxMonth) * 100)}%`, opacity: m.billed > 0 ? 1 : 0.25 }}></i>
                      <em>{m.mkey.slice(5)}</em>
                    </div>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 8 }}>
                  Bars = billed per month{lastGrowth !== null ? ` · last month ${lastGrowth >= 0 ? "grew" : "fell"} ${Math.abs(lastGrowth)}% vs the month before` : ""}
                </div>
              </>
            )}
          </div>
          <div className="card pad">
            <h3>Stock value (at cost)</h3>
            <div className="grid g2 sec" style={{ marginBottom: 10 }}>
              <div className="kpi"><div className="l">Total stock on hand</div><div className="v">{money0(stockValue)}</div><div className="d">{stockRows.length} items</div></div>
              <div className="kpi"><div className="l">Low stock</div><div className="v" style={lowStock.length ? { color: "var(--bad)" } : undefined}>{lowStock.length}</div><div className="d">at or below minimum</div></div>
            </div>
            {stockRows.slice(0, 6).map((r) => (
              <div className="tot" key={r.name}>
                <span>{r.name} · {r.qty} {r.unit}</span>
                <span>{money0(r.value)}</span>
              </div>
            ))}
            <div className="hint" style={{ marginTop: 8 }}>Valued at the last purchase rate of each item.</div>
          </div>
        </div>

        <div className="grid split" style={{ marginBottom: 14 }}>
          <div className="card pad">
            <h3>Revenue by day</h3>
            {bars.length === 0 ? (
              <div className="empty"><div className="big">📉</div>No bills in this period.</div>
            ) : (
              <>
                <div className="cols">
                  {bars.map(([k, v]) => (
                    <div key={k} className={"colv" + (v.billed === maxDay ? " gold" : "")} title={`${k} — billed ${money(v.billed)} · collected ${money(v.collected)}`}>
                      <b>{money0(v.billed)}</b>
                      <i style={{ height: `${Math.max(3, (v.billed / maxDay) * 100)}%` }}></i>
                      <em>{k.slice(8)}</em>
                    </div>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 8 }}>Peak day {money(maxDay)} · average working day {money0(dayRevAvg)}</div>
              </>
            )}
          </div>
          <div className="card pad">
            <h3>Expenses by head</h3>
            {heads.length === 0 ? (
              <div className="empty"><div className="big">🧾</div>No expenses recorded in this period.</div>
            ) : (
              <>
                {heads.map(([h, v]) => (
                  <div key={h} style={{ marginBottom: 10 }}>
                    <div className="tot">
                      <span>{h}</span>
                      <span>{money(v)} · {R((v / cur.expenses) * 100)}%</span>
                    </div>
                    <div className="bar"><i style={{ width: `${(v / maxHead) * 100}%` }}></i></div>
                  </div>
                ))}
                <div className="hint" style={{ marginTop: 8 }}>
                  Overhead: expenses are {overhead}% of what was collected{capex > 0 ? ` (includes ${money(capex)} one-time equipment)` : ""}.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ padding: "14px 16px 0" }}>Day-by-day accounts</h3>
          <div className="tw" style={{ boxShadow: "none", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">New patients</th>
                  <th className="num">Bills</th>
                  <th className="num">Billed</th>
                  <th className="num">Collected</th>
                  <th className="num">Expenses</th>
                  <th className="num">Day profit</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.length === 0 && (
                  <tr><td colSpan={7}><div className="empty">Nothing recorded in this period.</div></td></tr>
                )}
                {dayRows.map(([k, v]) => {
                  const dp = R(v.collected - v.expenses);
                  return (
                    <tr key={k}>
                      <td><b>{dmy(k)}</b></td>
                      <td className="num">{v.np || "—"}</td>
                      <td className="num">{v.bills || "—"}</td>
                      <td className="num"><b>{money(v.billed)}</b></td>
                      <td className="num">{money(v.collected)}</td>
                      <td className="num">{v.expenses ? money(v.expenses) : "—"}</td>
                      <td className="num" style={{ color: dp >= 0 ? undefined : "var(--bad)" }}>{v.collected || v.expenses ? money(dp) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ padding: "14px 16px 0" }}>Revenue by doctor &amp; physiotherapist</h3>
          <div className="tw" style={{ boxShadow: "none", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Professional</th>
                  <th>Role</th>
                  <th className="num">Bills</th>
                  <th className="num">Billed</th>
                  <th className="num">Collected (in period)</th>
                  <th className="num">Share</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byPro.size === 0 && (
                  <tr><td colSpan={7}><div className="empty"><div className="big">🩺</div>No revenue attributed in this period.</div></td></tr>
                )}
                {[...byPro.entries()]
                  .sort((a, b) => b[1].billed - a[1].billed)
                  .map(([id, e]) => (
                    <tr key={id}>
                      <td><b>{e.name}</b></td>
                      <td><span className="chip info">{e.kind === "physio" ? "Physio" : e.kind === "doctor" ? "Doctor" : "Front desk"}</span></td>
                      <td className="num">{e.bills}</td>
                      <td className="num"><b>{money(e.billed)}</b></td>
                      <td className="num">{money(e.collected)}</td>
                      <td className="num">{cur.billed > 0 ? R((e.billed / cur.billed) * 100) + "%" : "—"}</td>
                      <td><Link className="btn sm ghost" href={qs(p, id === "_none" ? "none" : id)}>Only this</Link></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid split">
          <div className="card pad">
            <h3>Procedure share of revenue</h3>
            {cats.length === 0 ? (
              <div className="empty">Nothing in this period.</div>
            ) : (
              cats.map(([c, v]) => (
                <div key={c} style={{ marginBottom: 10 }}>
                  <div className="tot">
                    <span>{c}</span>
                    <span>{money(v)} · {catTotal > 0 ? R((v / catTotal) * 100) : 0}%</span>
                  </div>
                  <div className="bar"><i style={{ width: `${(v / cats[0][1]) * 100}%` }}></i></div>
                </div>
              ))
            )}
          </div>
          <div className="card pad">
            <h3>Payment modes</h3>
            {cur.collected === 0 ? (
              <div className="empty"><div className="big">💵</div>Nothing collected yet.</div>
            ) : (
              <>
                {MODES.map((m) => {
                  const v = byMode.get(m) || 0;
                  return (
                    <div className="tot" key={m}>
                      <span>{m}</span>
                      <span>{money(v)} · {R((v / cur.collected) * 100)}%</span>
                    </div>
                  );
                })}
                <div className="hint" style={{ marginTop: 8 }}>
                  Cash is {R(cashShare)}% of receipts — keep under 5% for presumptive-tax safety.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid split" style={{ marginTop: 14 }}>
          <div className="card pad">
            <h3>Week-by-week</h3>
            {weeks.length === 0 ? (
              <div className="empty">Nothing in this period.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Week (Mon)</th><th className="num">Bills</th><th className="num">Billed</th><th className="num">Collected</th></tr>
                </thead>
                <tbody>
                  {weeks.map(([k, w]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="num">{w.bills}</td>
                      <td className="num"><b>{money(w.billed)}</b></td>
                      <td className="num">{money(w.collected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card pad">
            <h3>Top services</h3>
            {topSvc.length === 0 ? (
              <div className="empty">Nothing in this period.</div>
            ) : (
              <table>
                <tbody>
                  {topSvc.map(([name, e]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>×{e.n}</td>
                      <td className="num"><b>{money(e.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

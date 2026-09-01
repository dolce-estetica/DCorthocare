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
  const doctors: any[] = Array.isArray(doc.doctors) ? doc.doctors : [];
  const services: any[] = Array.isArray(doc.services) ? doc.services : [];

  const range = resolveRange(p, fromS, toS);
  const fromKey = dayKey(range.from);
  const toKey = dayKey(range.to);

  const proName = (id?: string) => {
    const d = doctors.find((x) => x.id === id);
    return d ? d.name : "Front desk / unattributed";
  };
  const proKind = (id?: string) => {
    const d = doctors.find((x) => x.id === id);
    return d ? d.kind || "doctor" : "staff";
  };

  const bills = allBills.filter(
    (b) =>
      !b.cancelled &&
      b.date >= fromKey &&
      b.date <= toKey &&
      (!pro || (pro === "none" ? !b.doctorId : b.doctorId === pro))
  );
  const paymentsOf = (b: DocBill) => (b.payments || []).reduce((s, x) => s + (Number(x.amt) || 0), 0);
  const payments = bills.flatMap((b) => (b.payments || []).map((x) => ({ ...x, bill: b })));

  const billed = R(bills.reduce((s, b) => s + b.net, 0));
  const gross = R(bills.reduce((s, b) => s + b.gross, 0));
  const discounts = R(bills.reduce((s, b) => s + (b.disc || 0), 0));
  const gst = R(bills.reduce((s, b) => s + (b.cgst || 0) + (b.sgst || 0), 0));
  const collected = R(payments.reduce((s, x) => s + x.amt, 0));
  const pending = R(
    allBills
      .filter((b) => !b.cancelled && b.date <= toKey && (!pro || (pro === "none" ? !b.doctorId : b.doctorId === pro)))
      .reduce((s, b) => s + (b.net - paymentsOf(b)), 0)
  );
  const patients = new Set(bills.map((b) => b.patientId || b.pname)).size;
  const avg = bills.length ? billed / bills.length : 0;
  const cashAmt = payments.filter((x) => x.mode === "Cash").reduce((s, x) => s + x.amt, 0);
  const cashShare = collected > 0 ? (cashAmt / collected) * 100 : 0;

  /* by day */
  const byDay = new Map<string, number>();
  bills.forEach((b) => byDay.set(b.date, (byDay.get(b.date) || 0) + b.net));
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-35);
  const maxDay = Math.max(1, ...days.map((d) => d[1]));

  /* by week */
  const byWeek = new Map<string, { bills: number; billed: number; collected: number }>();
  bills.forEach((b) => {
    const k = weekKey(b.date + "T12:00:00+05:30");
    const w = byWeek.get(k) || { bills: 0, billed: 0, collected: 0 };
    w.bills++;
    w.billed += b.net;
    byWeek.set(k, w);
  });
  payments.forEach((x) => {
    const k = weekKey(x.d + "T12:00:00+05:30");
    const w = byWeek.get(k) || { bills: 0, billed: 0, collected: 0 };
    w.collected += x.amt;
    byWeek.set(k, w);
  });
  const weeks = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  /* by professional */
  type ProRow = { name: string; kind: string; bills: number; billed: number; collected: number };
  const byPro = new Map<string, ProRow>();
  bills.forEach((b) => {
    const k = b.doctorId || "_none";
    const e = byPro.get(k) || { name: proName(b.doctorId), kind: proKind(b.doctorId), bills: 0, billed: 0, collected: 0 };
    e.bills++;
    e.billed += b.net;
    byPro.set(k, e);
  });
  payments.forEach((x) => {
    const k = x.bill.doctorId || "_none";
    const e = byPro.get(k);
    if (e) e.collected += x.amt;
  });

  /* by category & top services */
  const svcCat = (sid?: string, name?: string) => {
    const s = services.find((x) => x.id === sid);
    return s?.cat || "Other";
  };
  const byCat = new Map<string, number>();
  const bySvc = new Map<string, { amount: number; n: number }>();
  bills.forEach((b) =>
    (b.lines || []).forEach((l) => {
      const c = svcCat(l.sid, l.name);
      byCat.set(c, (byCat.get(c) || 0) + l.amt);
      const e = bySvc.get(l.name || c) || { amount: 0, n: 0 };
      e.amount += l.amt;
      e.n++;
      bySvc.set(l.name || c, e);
    })
  );
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));
  const topSvc = [...bySvc.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);

  /* payment modes (clinic mode labels) */
  const MODES = ["Cash", "UPI", "Card", "Bank transfer", "Cheque"];
  const byMode = new Map<string, number>();
  payments.forEach((x) => byMode.set(x.mode, (byMode.get(x.mode) || 0) + x.amt));

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

  return (
    <>
      <PageHeader title="Admin Dashboard" sub={`${range.label} · from the live clinic books`}>
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

        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="kpi">
            <div className="l">Total revenue (billed)</div>
            <div className="v">{money(billed)}</div>
            <div className="d">{bills.length} bills · {patients} patients</div>
          </div>
          <div className="kpi acc">
            <div className="l">Collected</div>
            <div className="v">{money(collected)}</div>
            <div className="d">{payments.length} receipts in period</div>
          </div>
          <div className="kpi">
            <div className="l">Pending dues</div>
            <div className="v">{money(pending)}</div>
            <div className="d">all bills up to end of period</div>
          </div>
          <div className="kpi">
            <div className="l">Average bill</div>
            <div className="v">{money(avg)}</div>
            <div className="d">after discount, incl. GST</div>
          </div>
        </div>
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="kpi">
            <div className="l">Gross before discount</div>
            <div className="v">{money(gross)}</div>
            <div className="d">at displayed rate card</div>
          </div>
          <div className="kpi">
            <div className="l">Discounts given</div>
            <div className="v">{money(discounts)}</div>
            <div className="d">{bills.filter((b) => (b.disc || 0) > 0).length} discounted bills</div>
          </div>
          <div className="kpi">
            <div className="l">GST component</div>
            <div className="v">{money(gst)}</div>
            <div className="d">CGST + SGST on goods &amp; aesthetic</div>
          </div>
          <div className="kpi">
            <div className="l">Cash share</div>
            <div className="v" style={cashShare > 5 ? { color: "var(--bad)" } : undefined}>
              {R(cashShare)}%
            </div>
            <div className="d">keep under 5% for GST safety</div>
          </div>
        </div>

        <div className="grid split" style={{ marginBottom: 14 }}>
          <div className="card pad">
            <h3>Revenue by day</h3>
            {days.length === 0 ? (
              <div className="empty"><div className="big">📉</div>No bills in this period.</div>
            ) : (
              <>
                <div className="cols">
                  {days.map(([k, v]) => (
                    <div key={k} className={"colv" + (v === maxDay ? " gold" : "")} title={`${k} — ${money(v)}`}>
                      <b>{money0(v)}</b>
                      <i style={{ height: `${Math.max(3, (v / maxDay) * 100)}%` }}></i>
                      <em>{k.slice(8)}</em>
                    </div>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 8 }}>Peak day: {money(maxDay)} · gold bar marks the peak</div>
              </>
            )}
          </div>
          <div className="card pad">
            <h3>Payment modes</h3>
            {collected === 0 ? (
              <div className="empty"><div className="big">💵</div>Nothing collected yet.</div>
            ) : (
              <>
                {MODES.map((m) => {
                  const v = byMode.get(m) || 0;
                  return (
                    <div className="tot" key={m}>
                      <span>{m}</span>
                      <span>{money(v)} · {R((v / collected) * 100)}%</span>
                    </div>
                  );
                })}
              </>
            )}
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byPro.size === 0 && (
                  <tr><td colSpan={6}><div className="empty"><div className="big">🩺</div>No revenue attributed in this period.</div></td></tr>
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
                      <td><Link className="btn sm ghost" href={qs(p, id === "_none" ? "none" : id)}>Only this</Link></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ padding: "14px 16px 0" }}>Week-by-week</h3>
          <div className="tw" style={{ boxShadow: "none", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Week starting (Mon)</th>
                  <th className="num">Bills</th>
                  <th className="num">Billed</th>
                  <th className="num">Collected</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {weeks.length === 0 && (
                  <tr><td colSpan={5}><div className="empty">Nothing in this period.</div></td></tr>
                )}
                {weeks.map(([k, w]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="num">{w.bills}</td>
                    <td className="num"><b>{money(w.billed)}</b></td>
                    <td className="num">{money(w.collected)}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="bar" style={{ margin: 0 }}>
                        <i style={{ width: `${Math.min(100, (w.billed / Math.max(1, ...weeks.map((x) => x[1].billed))) * 100)}%` }}></i>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid split">
          <div className="card pad">
            <h3>Revenue by category</h3>
            {cats.length === 0 ? (
              <div className="empty">Nothing in this period.</div>
            ) : (
              cats.map(([c, v]) => (
                <div key={c} style={{ marginBottom: 10 }}>
                  <div className="tot">
                    <span>{c}</span>
                    <span>{money(v)}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(v / maxCat) * 100}%` }}></i>
                  </div>
                </div>
              ))
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

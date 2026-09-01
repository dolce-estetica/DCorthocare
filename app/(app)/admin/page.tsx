import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money, money0, dayKey, roleLabel, R } from "@/lib/format";
import { resolveRange, weekKey, Period } from "@/lib/period";
import PageHeader from "../PageHeader";

export const dynamic = "force-dynamic";

const MODE_COLORS: Record<string, string> = {
  CASH: "#B26A00",
  UPI: "#0E7C57",
  CARD: "#1E4E7F",
  BANK: "#6B4E9B",
};

function qs(p: string, pro: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  params.set("p", p);
  if (pro) params.set("pro", pro);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/admin?${params.toString()}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string)) || "";
  const p = (one("p") || "month") as Period;
  const pro = one("pro");
  const fromS = one("from");
  const toS = one("to");

  const professionals = await prisma.user.findMany({
    where: { role: { in: ["DOCTOR", "PHYSIO"] }, active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const range = resolveRange(p, fromS, toS);
  const proFilter = pro ? { professionalId: pro } : undefined;

  const bills = await prisma.bill.findMany({
    where: { date: { gte: range.from, lte: range.to }, ...proFilter },
    include: { patient: true, professional: true, items: { include: { service: true } }, payments: true },
  });
  const payments = await prisma.payment.findMany({
    where: { date: { gte: range.from, lte: range.to }, bill: proFilter ? { professionalId: pro } : undefined },
  });
  const billsUpTo = await prisma.bill.findMany({
    where: { date: { lte: range.to }, ...proFilter },
    include: { payments: true },
  });

  const billed = R(bills.reduce((s, b) => s + b.total, 0));
  const discounts = R(bills.reduce((s, b) => s + b.discountAmount, 0));
  const gst = R(bills.reduce((s, b) => s + b.taxAmount, 0));
  const collected = R(payments.reduce((s, x) => s + x.amount, 0));
  const pending = R(
    billsUpTo.reduce((s, b) => s + (b.total - b.payments.reduce((x, q) => x + q.amount, 0)), 0)
  );
  const patients = new Set(bills.map((b) => b.patientId)).size;
  const avg = bills.length ? billed / bills.length : 0;
  const cashShare = collected > 0 ? (payments.filter((x) => x.mode === "CASH").reduce((s, x) => s + x.amount, 0) / collected) * 100 : 0;

  /* ---- daily series (cap 35 latest days in range) ---- */
  const byDay = new Map<string, number>();
  bills.forEach((b) => {
    const k = dayKey(b.date);
    byDay.set(k, (byDay.get(k) || 0) + b.total);
  });
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-35);
  const maxDay = Math.max(1, ...days.map((d) => d[1]));

  /* ---- weekly ---- */
  const byWeek = new Map<string, { bills: number; billed: number; collected: number }>();
  bills.forEach((b) => {
    const k = weekKey(b.date);
    const w = byWeek.get(k) || { bills: 0, billed: 0, collected: 0 };
    w.bills++;
    w.billed += b.total;
    byWeek.set(k, w);
  });
  payments.forEach((x) => {
    const k = weekKey(x.date);
    const w = byWeek.get(k) || { bills: 0, billed: 0, collected: 0 };
    w.collected += x.amount;
    byWeek.set(k, w);
  });
  const weeks = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  /* ---- per professional ---- */
  type Pro = { name: string; role: string; bills: number; patients: Set<string>; billed: number; collected: number; pending: number };
  const byPro = new Map<string, Pro>();
  bills.forEach((b) => {
    const k = b.professionalId;
    const e = byPro.get(k) || { name: b.professional.name, role: b.professional.role, bills: 0, patients: new Set<string>(), billed: 0, collected: 0, pending: 0 };
    e.bills++;
    e.patients.add(b.patientId);
    e.billed += b.total;
    byPro.set(k, e);
  });
  payments.forEach((x) => {
    const b = bills.find((bb) => bb.id === x.billId);
    if (!b) return;
    const e = byPro.get(b.professionalId);
    if (e) e.collected += x.amount;
  });
  billsUpTo.forEach((b) => {
    const e = byPro.get(b.professionalId);
    if (e) e.pending += b.total - b.payments.reduce((x, q) => x + q.amount, 0);
  });

  /* ---- categories & top services ---- */
  const byCat = new Map<string, number>();
  bills.forEach((b) =>
    b.items.forEach((i) => {
      const c = i.service?.category || "Other";
      byCat.set(c, (byCat.get(c) || 0) + i.amount);
    })
  );
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));

  const bySvc = new Map<string, { amount: number; n: number }>();
  bills.forEach((b) =>
    b.items.forEach((i) => {
      const e = bySvc.get(i.name) || { amount: 0, n: 0 };
      e.amount += i.amount;
      e.n++;
      bySvc.set(i.name, e);
    })
  );
  const topSvc = [...bySvc.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);

  /* ---- payment modes ---- */
  const byMode = new Map<string, number>();
  payments.forEach((x) => byMode.set(x.mode, (byMode.get(x.mode) || 0) + x.amount));

  const pills: [string, string][] = [
    ["today", "Today"],
    ["week", "This week"],
    ["month", "This month"],
    ["fy", "This FY"],
    ["all", "All time"],
  ];
  const selectedPro = professionals.find((x) => x.id === pro);

  return (
    <>
      <PageHeader title="Admin Dashboard" sub={selectedPro ? `${range.label} · ${selectedPro.name}` : range.label}>
        <Link className="btn sm ghost" href="/bills?status=DUE">Dues follow-up</Link>
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
              <select name="pro" defaultValue={pro} style={{ minWidth: 170 }}>
                <option value="">All professionals</option>
                {professionals.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.role === "PHYSIO" ? "Physio" : "Doctor"})
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
            <div className="l">Discounts given</div>
            <div className="v">{money(discounts)}</div>
            <div className="d">{bills.filter((b) => b.discountAmount > 0).length} discounted bills</div>
          </div>
          <div className="kpi">
            <div className="l">GST component</div>
            <div className="v">{money(gst)}</div>
            <div className="d">goods &amp; aesthetic services</div>
          </div>
          <div className="kpi">
            <div className="l">Net of GST</div>
            <div className="v">{money(billed - gst)}</div>
            <div className="d">taxable healthcare revenue</div>
          </div>
          <div className="kpi">
            <div className="l">Cash share</div>
            <div className="v" style={cashShare > 5 ? { color: "var(--bad)" } : undefined}>{R(cashShare)}%</div>
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
                {(["CASH", "UPI", "CARD", "BANK"] as const).map((m) => {
                  const v = byMode.get(m) || 0;
                  return (
                    <div className="tot" key={m}>
                      <span>{m}</span>
                      <span>{money(v)} · {R((v / collected) * 100)}%</span>
                    </div>
                  );
                })}
                <div className="modebar">
                  {(["CASH", "UPI", "CARD", "BANK"] as const).map((m) => {
                    const v = byMode.get(m) || 0;
                    return <i key={m} style={{ width: `${(v / collected) * 100}%`, background: MODE_COLORS[m] }}></i>;
                  })}
                </div>
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
                  <th className="num">Patients</th>
                  <th className="num">Billed</th>
                  <th className="num">Collected (in period)</th>
                  <th className="num">Pending</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byPro.size === 0 && (
                  <tr><td colSpan={8}><div className="empty"><div className="big">🩺</div>No revenue attributed in this period.</div></td></tr>
                )}
                {[...byPro.entries()]
                  .sort((a, b) => b[1].billed - a[1].billed)
                  .map(([id, e]) => (
                    <tr key={id}>
                      <td><b>{e.name}</b></td>
                      <td><span className="chip info">{e.role === "PHYSIO" ? "Physio" : "Doctor"}</span></td>
                      <td className="num">{e.bills}</td>
                      <td className="num">{e.patients.size}</td>
                      <td className="num"><b>{money(e.billed)}</b></td>
                      <td className="num">{money(e.collected)}</td>
                      <td className="num" style={{ color: e.pending > 0 ? "var(--bad)" : undefined }}>{money(e.pending)}</td>
                      <td><Link className="btn sm ghost" href={qs(p, id, fromS, toS)}>Only this</Link></td>
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
